import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, immutableRelation } from '@nozbe/watermelondb/decorators';

export default class EstoqueMovimentacao extends Model {
  static table = 'estoque_movimentacoes';

  static associations = {
    produtos: { type: 'belongs_to', key: 'produto_id' },
    pessoas:  { type: 'belongs_to', key: 'pessoa_id' },
  };

  @field('produto_id')        produtoId;
  @field('tipo_movimentacao') tipoMovimentacao; // enum TipoMovimentacao
  @field('quantidade')        quantidade;
  @field('referencia_id')     referenciaId;
  @field('pessoa_id')         pessoaId;

  // Armazenado como Unix ms; @date converte para Date ao acessar
  @date('data_movimentacao')    dataMovimentacao;
  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;

  // Movimentações são imutáveis após criadas
  @immutableRelation('produtos', 'produto_id') produto;
  @immutableRelation('pessoas',  'pessoa_id')  pessoa;
}
