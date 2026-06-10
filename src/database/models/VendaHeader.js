import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, relation, children } from '@nozbe/watermelondb/decorators';

export default class VendaHeader extends Model {
  static table = 'vendas';

  static associations = {
    pessoas:           { type: 'belongs_to', key: 'cliente_id' },
    vendas_itens:      { type: 'has_many',   foreignKey: 'venda_id' },
    vendas_pagamentos: { type: 'has_many',   foreignKey: 'venda_id' },
  };

  @field('cliente_id') clienteId;
  @field('status')     status;     // 'aberta' | 'finalizada' | 'cancelada'
  @field('total')      total;
  @date('data_venda')  dataVenda;  // data real da venda (permite retroativo)

  @readonly @date('created_at') createdAt;
  @date('updated_at')           updatedAt;

  @relation('pessoas', 'cliente_id') cliente;

  @children('vendas_itens')      itens;
  @children('vendas_pagamentos') pagamentos;
}
