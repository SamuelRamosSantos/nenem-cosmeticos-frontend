import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, immutableRelation } from '@nozbe/watermelondb/decorators';

export default class VendaPagamento extends Model {
  static table = 'vendas_pagamentos';

  static associations = {
    vendas:            { type: 'belongs_to', key: 'venda_id' },
    formas_pagamento:  { type: 'belongs_to', key: 'forma_pagamento_id' },
  };

  @field('venda_id')           vendaId;
  @field('forma_pagamento_id') formaPagamentoId;
  @field('valor')              valor;

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;

  @immutableRelation('vendas',           'venda_id')           venda;
  @immutableRelation('formas_pagamento', 'forma_pagamento_id') formaPagamento;
}
