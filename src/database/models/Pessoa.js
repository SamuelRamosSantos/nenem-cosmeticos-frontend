import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';

export default class Pessoa extends Model {
  static table = 'pessoas';

  static associations = {
    vendas:               { type: 'has_many', foreignKey: 'cliente_id' },
    compras:              { type: 'has_many', foreignKey: 'fornecedor_id' },
    estoque_movimentacoes: { type: 'has_many', foreignKey: 'pessoa_id' },
  };

  @field('nome')     nome;
  @field('telefone') telefone;
  @field('tipo')     tipo; // 'cliente' | 'fornecedor'

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;
}
