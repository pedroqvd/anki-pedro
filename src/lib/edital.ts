// =====================================================================
// EDITAL VERTICALIZADO — CONCURSO BANCO DO BRASIL
// Estrutura hierárquica: Área > Disciplina > Tópico
// =====================================================================

export interface Topic {
  name: string;
}

export interface Discipline {
  name: string;
  questions: number; // Quantidade de questões na prova
  topics: Topic[];
}

export interface Area {
  name: string;
  totalQuestions: number;
  disciplines: Discipline[];
}

export const EDITAL: Area[] = [
  {
    name: "Conhecimentos Básicos",
    totalQuestions: 25,
    disciplines: [
      {
        name: "Língua Portuguesa",
        questions: 10,
        topics: [
          { name: "Compreensão de textos" },
          { name: "Ortografia oficial" },
          { name: "Classe e emprego de palavras" },
          { name: "Emprego do acento indicativo de crase" },
          { name: "Sintaxe da oração e do período" },
          { name: "Emprego dos sinais de pontuação" },
          { name: "Concordância verbal e nominal" },
          { name: "Regência verbal e nominal" },
          { name: "Colocação dos pronomes oblíquos átonos (próclise, mesóclise e ênclise)" },
          { name: "Coesão e Coerência (pronomes e expressões referenciais, nexos, operadores sequenciais)" }
        ]
      },
      {
        name: "Língua Inglesa",
        questions: 5,
        topics: [
          { name: "Vocabulário fundamental e aspectos gramaticais para compreensão de textos" }
        ]
      },
      {
        name: "Matemática",
        questions: 5,
        topics: [
          { name: "Números inteiros, racionais e reais; problemas de contagem" },
          { name: "Sistema legal de medidas" },
          { name: "Razões e proporções; divisão proporcional; regras de três simples e compostas; porcentagens" },
          { name: "Lógica proposicional e Noções de conjuntos" },
          { name: "Relações e funções; Funções polinomiais" },
          { name: "Equações e inequações; Sistemas lineares" },
          { name: "Sequências: PA e PG" },
          { name: "Matrizes" },
          { name: "Determinantes" },
          { name: "Funções exponenciais e logarítmicas" }
        ]
      },
      {
        name: "Atualidades do Mercado Financeiro",
        questions: 5,
        topics: [
          { name: "Os bancos na Era Digital: Atualidade, tendências e desafios" },
          { name: "Internet banking e Mobile banking" },
          { name: "Open Banking (Open Finance)" },
          { name: "Fintechs, startups e big techs" },
          { name: "Sistema de pagamentos instantâneos (PIX)" },
          { name: "Transformação digital no Sistema Financeiro" },
          { name: "Moeda e funções da moeda" },
          { name: "Blockchain, bitcoin e criptomoedas" },
          { name: "Correspondentes bancários" },
          { name: "Arranjos de pagamentos" },
          { name: "Sistema de bancos-sombra (Shadow banking)" },
          { name: "Marketplace" },
          { name: "Segmentação e interações digitais" }
        ]
      }
    ]
  },
  {
    name: "Conhecimentos Específicos",
    totalQuestions: 45,
    disciplines: [
      {
        name: "Matemática Financeira",
        questions: 5,
        topics: [
          { name: "O conceito do valor do dinheiro no tempo" },
          { name: "Capital, juros, taxas de juros" },
          { name: "Capitalização, regimes de capitalização" },
          { name: "Fluxos de caixa e diagramas de fluxo de caixa" },
          { name: "Equivalência financeira" },
          { name: "Juros simples e compostos" },
          { name: "Taxas de juros: nominal, efetiva, equivalentes, proporcionais, real e aparente" },
          { name: "Descontos: simples, racional e comercial" },
          { name: "Sistemas de amortização (SAC e Price)" }
        ]
      },
      {
        name: "Conhecimentos Bancários",
        questions: 10,
        topics: [
          { name: "SFN: Órgãos normativos, supervisoras, executoras e operadoras" },
          { name: "Mercado financeiro (monetário, crédito, capitais e cambial)" },
          { name: "Moeda e política monetária (Quantitative Easing; Taxa SELIC)" },
          { name: "Orçamento público, títulos do Tesouro Nacional e dívida pública" },
          { name: "Produtos Bancários (cartões, CDC, rural, poupança, capitalização, previdência, consórcio, investimentos, seguros)" },
          { name: "Noções de Mercado de capitais e Mercado de Câmbio" },
          { name: "Operações no mercado interbancário, tesouraria e varejo" },
          { name: "Taxas de juros de curto prazo e curva de juros" },
          { name: "Garantias do SFN (Aval, fiança, penhor, alienação fiduciária, hipoteca)" },
          { name: "Lavagem de dinheiro (Lei 9.613/98 e Circular Bacen 3.978/2020)" },
          { name: "Ética e ASG / LGPD no sistema financeiro" },
          { name: "Sigilo Bancário (LC 105/2001)" },
          { name: "Lei Anticorrupção (Lei 12.846/2013)" },
          { name: "Regimes de taxas de câmbio" }
        ]
      },
      {
        name: "Conhecimentos de Informática",
        questions: 15,
        topics: [
          { name: "Sistemas operacionais: Windows e Linux" },
          { name: "Edição de textos, planilhas e apresentações (MS Office e LibreOffice)" },
          { name: "Redes de computadores, Internet e intranet, Navegadores e Correio eletrônico" },
          { name: "Redes sociais, computação na nuvem (cloud computing)" },
          { name: "Segurança da informação: vírus, worms, malwares" },
          { name: "Ferramentas de produtividade (Teams, Webex, Meet)" },
          { name: "Navegadores Web (Edge, Firefox, Chrome)" },
          { name: "Busca e pesquisa na Web" }
        ]
      },
      {
        name: "Vendas e Negociação",
        questions: 15,
        topics: [
          { name: "Estratégia empresarial: análise de mercado, forças competitivas, imagem institucional" },
          { name: "Segmentação de mercado e valor percebido pelo cliente" },
          { name: "Gestão da experiência do cliente" },
          { name: "Aprendizagem e sustentabilidade organizacional" },
          { name: "Características dos serviços e Gestão da qualidade" },
          { name: "Técnicas de vendas: Da pré-abordagem ao pós-vendas" },
          { name: "Marketing digital: Leads, copywriting, gatilhos mentais, Inbound" },
          { name: "Ética e conduta profissional em vendas / Canais remotos" },
          { name: "Comportamento do consumidor" },
          { name: "Política de Relacionamento com o Cliente (Resolução CMN 4.949/2021)" },
          { name: "Ouvidoria (Resolução CMN 4.860/2020)" },
          { name: "Lei Brasileira de Inclusão (Lei 13.146/2015)" },
          { name: "Código de Defesa do Consumidor (Lei 8.078/1990)" },
          { name: "Código de Ética e Conduta do BB" },
          { name: "Telemarketing" }
        ]
      }
    ]
  }
];

// Helpers
export function getAllDisciplines(): Discipline[] {
  return EDITAL.flatMap(a => a.disciplines);
}

export function getAllTopicPaths(): string[] {
  const paths: string[] = [];
  for (const area of EDITAL) {
    for (const disc of area.disciplines) {
      for (const topic of disc.topics) {
        paths.push(`${area.name} > ${disc.name} > ${topic.name}`);
      }
    }
  }
  return paths;
}

export function parseTopic(topicPath: string): { area: string; discipline: string; topic: string } {
  const parts = topicPath.split(' > ');
  return {
    area: parts[0] || '',
    discipline: parts[1] || '',
    topic: parts[2] || topicPath
  };
}

export function getDisciplineFromPath(topicPath: string): string {
  const parts = topicPath.split(' > ');
  return parts[1] || topicPath;
}

export function getTotalTopicsCount(): number {
  return EDITAL.reduce((sum, area) => 
    sum + area.disciplines.reduce((dSum, d) => dSum + d.topics.length, 0), 0);
}
