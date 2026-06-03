import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import schema from './schema';

import Pessoa              from './models/Pessoa';
import Marca               from './models/Marca';
import FormaPagamento      from './models/FormaPagamento';
import Produto             from './models/Produto';
import ProdutoKitItem      from './models/ProdutoKitItem';
import EstoqueMovimentacao from './models/EstoqueMovimentacao';
import VendaHeader         from './models/VendaHeader';
import VendaItem           from './models/VendaItem';
import VendaPagamento      from './models/VendaPagamento';
import CompraHeader        from './models/CompraHeader';
import CompraItem          from './models/CompraItem';
import CompraPagamento     from './models/CompraPagamento';

// SQLite nativo via JSI — compatível com New Architecture (React Native 0.73+)
const adapter = new SQLiteAdapter({
  schema,
  // migrations: migrations, // adicionar na Etapa de migrations quando o schema evoluir
  jsi: true,
  onSetUpError: (error) => {
    console.error('[WatermelonDB] Falha ao inicializar o banco local:', error);
  },
});

const database = new Database({
  adapter,
  modelClasses: [
    Pessoa,
    Marca,
    FormaPagamento,
    Produto,
    ProdutoKitItem,
    EstoqueMovimentacao,
    VendaHeader,
    VendaItem,
    VendaPagamento,
    CompraHeader,
    CompraItem,
    CompraPagamento,
  ],
});

export default database;
