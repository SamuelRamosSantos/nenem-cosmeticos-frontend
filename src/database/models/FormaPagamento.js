import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';

export default class FormaPagamento extends Model {
  static table = 'formas_pagamento';

  static associations = {
    vendas_pagamentos:     { type: 'has_many', foreignKey: 'forma_pagamento_id' },
    compras_pagamentos:    { type: 'has_many', foreignKey: 'forma_pagamento_id' },
    forma_pagamento_taxas: { type: 'has_many', foreignKey: 'forma_pagamento_id' },
  };

  @field('descricao') descricao;
  @field('tipo')       tipo; // 'V' à vista | 'C' cartão | 'P' a prazo

  // NC-72 — só usados quando tipo = 'P'
  @field('intervalo_dias')          intervaloDias;
  @field('limite_parcelas')         limiteParcelas;
  @field('juros_percentual_padrao') jurosPercentualPadrao;

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;

  @children('forma_pagamento_taxas') taxasCartao;
}
