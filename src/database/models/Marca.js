import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';

export default class Marca extends Model {
  static table = 'marcas';

  static associations = {
    produtos: { type: 'has_many', foreignKey: 'marca_id' },
  };

  @field('nome')                nome;
  @field('percentual_comissao') percentualComissao;

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;
}
