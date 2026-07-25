import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, immutableRelation } from '@nozbe/watermelondb/decorators';

// NC-71 — taxa de cartão por modalidade (Débito/Crédito) e parcela (1x-18x).
export default class FormaPagamentoTaxa extends Model {
  static table = 'forma_pagamento_taxas';

  static associations = {
    formas_pagamento: { type: 'belongs_to', key: 'forma_pagamento_id' },
  };

  @field('forma_pagamento_id') formaPagamentoId;
  @field('modalidade')         modalidade; // 'D' débito | 'C' crédito
  @field('parcelas')           parcelas;
  @field('taxa_percentual')    taxaPercentual;

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;

  @immutableRelation('formas_pagamento', 'forma_pagamento_id') formaPagamento;
}
