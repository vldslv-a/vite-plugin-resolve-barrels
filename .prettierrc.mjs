/** @type {import("prettier").Config} */
const config = {
  bracketSameLine: false,
  bracketSpacing: true,
  printWidth: 120,
  proseWrap: 'never',
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'es5',
  useTabs: false,
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      options: {
        parser: 'typescript',
      },
    },

    {
      files: ['*.js', '*.jsx'],
      options: {
        parser: 'babel',
      },
    },

    {
      files: ['*.json'],
      options: {
        parser: 'json',
      },
    },

    {
      files: ['*.graphql'],
      options: {
        parser: 'graphql',
      },
    },

    {
      files: ['*.md', '*.mdx'],
      options: {
        parser: 'mdx',
      },
    },

    {
      files: ['*.html'],
      options: {
        parser: 'html',
      },
    },

    {
      files: ['*.yaml', '*.yml'],
      options: {
        parser: 'yaml',
      },
    },
  ],
};

export default config;
