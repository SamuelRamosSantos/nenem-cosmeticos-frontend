import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children, immutableRelation } from '@nozbe/watermelondb/decorators';

// NC-73/74/75 — Título (Contas a Receber), gerado na finalização da venda.
export default class Titulo extends Model {
  static table = 'titulos';

  static associations = {
    vendas:         { type: 'belongs_to', key: 'venda_id' },
    pessoas:        { type: 'belongs_to', key: 'cliente_id' },
    titulos_baixas: { type: 'has_many',   foreignKey: 'titulo_id' },
  };

  @field('venda_id')          vendaId;
  @field('cliente_id')        clienteId;
  @field('parcela_numero')    parcelaNumero;
  @field('parcelas_total')    parcelasTotal;
  @field('valor_original')    valorOriginal;
  @field('valor_taxa_cartao') valorTaxaCartao;
  @field('valor_liquido')     valorLiquido;
  @field('status')            status; // 'Aberto' | 'Baixado' | 'Parcial'
  @field('reclassificado')    reclassificado; // true se a forma de pagamento foi alterada num estorno

  @date('data_vencimento') dataVencimento;
  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;

  @immutableRelation('vendas',  'venda_id')   venda;
  @immutableRelation('pessoas', 'cliente_id') cliente;
  @children('titulos_baixas') baixas;
}
