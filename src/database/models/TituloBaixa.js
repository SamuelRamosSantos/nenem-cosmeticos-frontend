import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, immutableRelation } from '@nozbe/watermelondb/decorators';

// NC-78 — recebimento contra um título (só forma de pagamento tipo 'V'/'C').
export default class TituloBaixa extends Model {
  static table = 'titulos_baixas';

  static associations = {
    titulos:          { type: 'belongs_to', key: 'titulo_id' },
    formas_pagamento: { type: 'belongs_to', key: 'forma_pagamento_id' },
  };

  @field('titulo_id')          tituloId;
  @field('forma_pagamento_id') formaPagamentoId;
  @field('valor_pago')         valorPago;

  @date('data_baixa') dataBaixa;
  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;

  @immutableRelation('titulos',          'titulo_id')          titulo;
  @immutableRelation('formas_pagamento', 'forma_pagamento_id') formaPagamento;
}
