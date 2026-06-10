import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation, children } from '@nozbe/watermelondb/decorators';

export default class Produto extends Model {
  static table = 'produtos';

  static associations = {
    marcas:                { type: 'belongs_to', key: 'marca_id' },
    produto_kit_itens:     { type: 'has_many',   foreignKey: 'produto_mestre_id' },
    estoque_movimentacoes: { type: 'has_many',   foreignKey: 'produto_id' },
    vendas_itens:          { type: 'has_many',   foreignKey: 'produto_id' },
    compras_itens:         { type: 'has_many',   foreignKey: 'produto_id' },
  };

  @field('descricao')      descricao;
  @field('marca_id')       marcaId;
  @field('preco_venda')    precoVenda;
  @field('custo_preco')    custoPreco;
  @field('cod_barras')     codBarras;
  @field('codigo_interno') codigoInterno;
  @field('tipo_baixa')        tipoBaixa;       // 'I' | 'M'
  @field('qtd_estoque')       qtdEstoque;
  @field('movimenta_estoque') movimentaEstoque; // boolean, default true
  @field('ativo')             ativo;            // false = inativado (soft delete)

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;

  // Relações observáveis
  @relation('marcas', 'marca_id') marca;

  @children('produto_kit_itens') kitItens;
  @children('estoque_movimentacoes') movimentacoes;
}
