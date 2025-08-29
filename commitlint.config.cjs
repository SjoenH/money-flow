/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
        'body-max-line-length': [2, 'always', 120],
    }
};