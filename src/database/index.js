import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import schema from './schema';
import migrations from './migrations'; // <-- 1. Adicionamos a importação aqui

import Pessoa from './models/Pessoa';
import Marca from './models/Marca';
import FormaPagamento from './models/FormaPagamento';
import FormaPagamentoTaxa from './models/FormaPagamentoTaxa';
import Produto from './models/Produto';
import ProdutoKitItem from './models/ProdutoKitItem';
import EstoqueMovimentacao from './models/EstoqueMovimentacao';
import VendaHeader from './models/VendaHeader';
import VendaItem from './models/VendaItem';
import VendaPagamento from './models/VendaPagamento';
import Titulo from './models/Titulo';
import TituloBaixa from './models/TituloBaixa';
import CompraHeader from './models/CompraHeader';
import CompraItem from './models/CompraItem';
import CompraPagamento from './models/CompraPagamento';
import Coleta from './models/Coleta';
import ColetaItem from './models/ColetaItem';

// SQLite nativo via JSI — compatível com New Architecture (React Native 0.73+)
const adapter = new SQLiteAdapter({
  schema,
  migrations, // <-- 2. Descomentamos e ativamos as migrações aqui
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
    FormaPagamentoTaxa,
    Produto,
    ProdutoKitItem,
    EstoqueMovimentacao,
    VendaHeader,
    VendaItem,
    VendaPagamento,
    Titulo,
    TituloBaixa,
    CompraHeader,
    CompraItem,
    CompraPagamento,
    Coleta,
    ColetaItem,
  ],
});

export default database;