import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';

export default class FormaPagamento extends Model {
  static table = 'formas_pagamento';

  static associations = {
    vendas_pagamentos:  { type: 'has_many', foreignKey: 'forma_pagamento_id' },
    compras_pagamentos: { type: 'has_many', foreignKey: 'forma_pagamento_id' },
  };

  @field('descricao') descricao;

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;
}
