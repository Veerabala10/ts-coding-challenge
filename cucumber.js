let common = [
    'features/**/*.feature',
    '--require-module ts-node/register', //typescript cucumber
    '--require ./features/step_definitions/**/*.ts',
    '--format progress-bar',
    `--format-options '{"snippetInterface": "synchronous"}'`,
    `--format progress`
].join(' ');

module.exports = {
    default: common,
    defaultTimeout: 60000
}
