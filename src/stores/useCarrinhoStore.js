import { create } from 'zustand';

// ID único por linha do carrinho — evita colisões mesmo com adições rápidas
const genItemId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// =============================================================================
// useCarrinhoStore — PDV (Ponto de Venda)
//
// Cada item do carrinho armazena:
//   itemId (único por linha), produtoId, descricao,
//   precoUnitario (editável), custoCalculado,
//   percentualComissao (da marca), tipoBaixa,
//   movimentaEstoque, quantidade
//
// Regra de acumulação:
//   - movimentaEstoque === false → sempre nova linha (serviços, itens avulsos)
//   - caso contrário             → acumula quantidade na linha existente
//
// O custo é recalculado quando o preço é editado:
//   custoCalculado = precoUnitario × (1 - percentualComissao / 100)
// =============================================================================
const useCarrinhoStore = create((set, get) => ({

  // ── Estado ──────────────────────────────────────────────────────────────────
  clienteId:   null,
  clienteNome: null,
  dataVenda:   new Date(),
  itens:       [],

  // ── Getters ─────────────────────────────────────────────────────────────────
  totalItens: () => get().itens.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0),

  // ── Actions: cabeçalho da venda ─────────────────────────────────────────────
  setCliente:    (id, nome) => set({ clienteId: id, clienteNome: nome }),
  limparCliente: ()         => set({ clienteId: null, clienteNome: null }),
  setDataVenda:  (date)     => set({ dataVenda: date }),

  // ── Actions: itens ──────────────────────────────────────────────────────────
  adicionarItem: (produto, percentualComissao = 0, quantidade = 1) => {
    set(state => {
      const preco = produto.precoVenda;
      const custo = preco * (1 - percentualComissao / 100);

      // Produtos sem movimentação de estoque entram sempre como nova linha separada
      // (ex: serviços, itens avulsos) — não acumulam com linhas anteriores
      if (produto.movimentaEstoque === false) {
        return {
          itens: [
            ...state.itens,
            {
              itemId:           genItemId(),
              produtoId:        produto.id,
              descricao:        produto.descricao,
              precoUnitario:    preco,
              custoCalculado:   custo,
              percentualComissao,
              tipoBaixa:        produto.tipoBaixa,
              movimentaEstoque: false,
              quantidade,
            },
          ],
        };
      }

      // Produtos com estoque: acumula quantidade na linha existente
      const existente = state.itens.find(
        i => i.produtoId === produto.id && i.movimentaEstoque !== false
      );

      if (existente) {
        return {
          itens: state.itens.map(i =>
            i.itemId === existente.itemId
              ? { ...i, quantidade: i.quantidade + quantidade }
              : i
          ),
        };
      }

      // Primeira vez que este produto entra no carrinho
      return {
        itens: [
          ...state.itens,
          {
            itemId:           genItemId(),
            produtoId:        produto.id,
            descricao:        produto.descricao,
            precoUnitario:    preco,
            custoCalculado:   custo,
            percentualComissao,
            tipoBaixa:        produto.tipoBaixa,
            movimentaEstoque: produto.movimentaEstoque ?? true,
            quantidade,
          },
        ],
      };
    });
  },

  // Todos os métodos de mutação identificam a linha pelo itemId (não pelo produtoId),
  // o que permite múltiplas linhas do mesmo produto no carrinho.

  removerItem: (itemId) =>
    set(state => ({ itens: state.itens.filter(i => i.itemId !== itemId) })),

  alterarQuantidade: (itemId, quantidade) => {
    if (quantidade <= 0) { get().removerItem(itemId); return; }
    set(state => ({
      itens: state.itens.map(i =>
        i.itemId === itemId ? { ...i, quantidade } : i
      ),
    }));
  },

  alterarPreco: (itemId, novoPrecoStr) => {
    set(state => ({
      itens: state.itens.map(i => {
        if (i.itemId !== itemId) return i;
        const preco = parseFloat(String(novoPrecoStr).replace(',', '.'));
        if (isNaN(preco) || preco < 0) return i;
        return {
          ...i,
          precoUnitario:  preco,
          custoCalculado: preco * (1 - i.percentualComissao / 100),
        };
      }),
    }));
  },

  // ── Reset ────────────────────────────────────────────────────────────────────
  limparCarrinho: () =>
    set({ clienteId: null, clienteNome: null, dataVenda: new Date(), itens: [] }),
}));

export default useCarrinhoStore;
