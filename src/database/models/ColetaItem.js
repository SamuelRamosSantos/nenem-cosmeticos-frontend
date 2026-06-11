import { Model } from '@nozbe/watermelondb';
import { field, relation } from '@nozbe/watermelondb/decorators';

export default class ColetaItem extends Model {
  static table = 'coleta_itens';

  static associations = {
    coletas:  { type: 'belongs_to', key: 'coleta_id' },
    produtos: { type: 'belongs_to', key: 'produto_id' },
  };

  @field('coleta_id')  coletaId;
  @field('produto_id') produtoId;
  @field('quantidade') quantidade;

  @relation('coletas',  'coleta_id')  coleta;
  @relation('produtos', 'produto_id') produto;
}
