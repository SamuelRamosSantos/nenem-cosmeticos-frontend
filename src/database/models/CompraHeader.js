import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation, children } from '@nozbe/watermelondb/decorators';

export default class CompraHeader extends Model {
  static table = 'compras';

  static associations = {
    pessoas:            { type: 'belongs_to', key: 'fornecedor_id' },
    compras_itens:      { type: 'has_many',   foreignKey: 'compra_id' },
    compras_pagamentos: { type: 'has_many',   foreignKey: 'compra_id' },
  };

  @field('fornecedor_id') fornecedorId;
  @field('status')        status;  // 'aberta' | 'finalizada' | 'cancelada'
  @field('total')         total;

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;

  @relation('pessoas', 'fornecedor_id') fornecedor;

  @children('compras_itens')      itens;
  @children('compras_pagamentos') pagamentos;
}
