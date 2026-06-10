import { create } from 'zustand';

// =============================================================================
// useCarrinhoStore — PDV (Ponto de Venda)
//
// Cada item do carrinho armazena:
//   produtoId, descricao, precoUnitario (editável), custoCalculado,
//   percentualComissao (da marca), tipoBaixa, quantidade
//
// O custo é recalculado sempre que o preço é editado:
//   custoCalculado = precoUnitario * (1 - percentualComissao / 100)
// =============================================================================
const useCarrinhoStore = create((set, get) => ({

  // ── Estado ──────────────────────────────────────────────────────────────────
  clienteId:   null,
  clienteNome: null,
  dataVenda:   new Date(),
  itens:       [],
  // Sem campo `pagamentos` — forma de pagamento é selecionada só na finalização

  // ── Getters ─────────────────────────────────────────────────────────────────
  totalItens: () => get().itens.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0),

  // ── Actions: cabeçalho da venda ──────────────────────────────────────────────
  setCliente:   (id, nome) => set({ clienteId: id, clienteNome: nome }),
  limparCliente: ()        => set({ clienteId: null, clienteNome: null }),
  setDataVenda: (date)     => set({ dataVenda: date }),

  // ── Actions: itens ──────────────────────────────────────────────────────────
  adicionarItem: (produto, percentualComissao = 0, quantidade = 1) => {
    set(state => {
      const existente = state.itens.find(i => i.produtoId === produto.id);

      if (existente) {
        return {
          itens: state.itens.map(i =>
            i.produtoId === produto.id
              ? { ...i, quantidade: i.quantidade + quantidade }
              : i
          ),
        };
      }

      const preco  = produto.precoVenda;
      const custo  = preco * (1 - percentualComissao / 100);

      return {
        itens: [
          ...state.itens,
          {
            produtoId:          produto.id,
            descricao:          produto.descricao,
            precoUnitario:      preco,
            custoCalculado:     custo,
            percentualComissao,
            tipoBaixa:          produto.tipoBaixa,
            quantidade,
          },
        ],
      };
    });
  },

  removerItem: (produtoId) =>
    set(state => ({ itens: state.itens.filter(i => i.produtoId !== produtoId) })),

  alterarQuantidade: (produtoId, quantidade) => {
    if (quantidade <= 0) { get().removerItem(produtoId); return; }
    set(state => ({
      itens: state.itens.map(i =>
        i.produtoId === produtoId ? { ...i, quantidade } : i
      ),
    }));
  },

  // Edita o preço de venda de um item e recalcula o custo pela comissão da marca
  alterarPreco: (produtoId, novoPrecoStr) => {
    set(state => ({
      itens: state.itens.map(i => {
        if (i.produtoId !== produtoId) return i;
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
