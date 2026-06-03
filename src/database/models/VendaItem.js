import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, immutableRelation } from '@nozbe/watermelondb/decorators';

export default class VendaItem extends Model {
  static table = 'vendas_itens';

  static associations = {
    vendas:   { type: 'belongs_to', key: 'venda_id' },
    produtos: { type: 'belongs_to', key: 'produto_id' },
  };

  @field('venda_id')               vendaId;
  @field('produto_id')             produtoId;
  @field('quantidade')             quantidade;
  @field('preco_unitario')         precoUnitario;
  // Custo congelado no momento da finalização da venda
  @field('custo_unitario_gravado') custoUnitarioGravado;

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;

  @immutableRelation('vendas',   'venda_id')   venda;
  @immutableRelation('produtos', 'produto_id') produto;
}
