import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, immutableRelation } from '@nozbe/watermelondb/decorators';

export default class CompraPagamento extends Model {
  static table = 'compras_pagamentos';

  static associations = {
    compras:           { type: 'belongs_to', key: 'compra_id' },
    formas_pagamento:  { type: 'belongs_to', key: 'forma_pagamento_id' },
  };

  @field('compra_id')          compraId;
  @field('forma_pagamento_id') formaPagamentoId;
  @field('valor')              valor;

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;

  @immutableRelation('compras',          'compra_id')          compra;
  @immutableRelation('formas_pagamento', 'forma_pagamento_id') formaPagamento;
}
