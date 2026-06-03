import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, immutableRelation } from '@nozbe/watermelondb/decorators';

export default class CompraItem extends Model {
  static table = 'compras_itens';

  static associations = {
    compras:  { type: 'belongs_to', key: 'compra_id' },
    produtos: { type: 'belongs_to', key: 'produto_id' },
  };

  @field('compra_id')     compraId;
  @field('produto_id')    produtoId;
  @field('quantidade')    quantidade;
  @field('custo_unitario') custoUnitario;

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;

  @immutableRelation('compras',  'compra_id')  compra;
  @immutableRelation('produtos', 'produto_id') produto;
}
