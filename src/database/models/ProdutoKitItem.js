import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, immutableRelation } from '@nozbe/watermelondb/decorators';

export default class ProdutoKitItem extends Model {
  static table = 'produto_kit_itens';

  static associations = {
    produtos: { type: 'belongs_to', key: 'produto_mestre_id' },
  };

  @field('produto_mestre_id')     produtoMestreId;
  @field('produto_individual_id') produtoIndividualId;
  @field('quantidade_necessaria') quantidadeNecessaria;

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;

  // A composição do kit não muda de produto mestre após criada
  @immutableRelation('produtos', 'produto_mestre_id')     produtoMestre;
  @immutableRelation('produtos', 'produto_individual_id') produtoIndividual;
}
