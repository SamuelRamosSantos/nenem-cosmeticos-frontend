import { Model } from '@nozbe/watermelondb';
import { field, date, children } from '@nozbe/watermelondb/decorators';

export default class Coleta extends Model {
  static table = 'coletas';

  static associations = {
    coleta_itens: { type: 'has_many', foreignKey: 'coleta_id' },
  };

  @field('nome')        nome;
  @date('data_criacao') dataCriacao;

  @children('coleta_itens') itens;
}
