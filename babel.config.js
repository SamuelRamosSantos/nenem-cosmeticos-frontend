module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // 1. TypeScript/Flow type stripping — allowDeclareFields: false (padrão) garante que
      //    campos de classe sem inicializador e sem decorator sejam tratados como type-only,
      //    sem gerar `this.field = void 0`. Com true, o Babel gerava `this.NONE = void 0`
      //    para os campos não-inicializados de Event.js do RN, conflitando com o
      //    Object.defineProperty({ writable: false }) feito logo depois no mesmo arquivo.
      ['@babel/plugin-transform-typescript', {
        isTSX: true,
        allExtensions: true,
        allowDeclareFields: false
      }],

      // 2. WatermelonDB — decorators legacy exigem loose:true no class-properties
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-private-methods', { loose: true }]
    ]
  };
};