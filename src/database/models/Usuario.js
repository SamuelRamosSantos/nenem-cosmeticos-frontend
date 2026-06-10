import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class Usuario extends Model {
  static table = 'usuarios';

  @field('nome')  nome;
  @field('senha') senha;
  @field('ativo') ativo;

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;
}
