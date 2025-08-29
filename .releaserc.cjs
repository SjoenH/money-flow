module.exports = {
    branches: [
        'main',
        { name: 'next', channel: 'next', prerelease: 'rc' },
        { name: 'beta', channel: 'beta', prerelease: true },
        { name: 'alpha', channel: 'alpha', prerelease: true }
    ],
    plugins: [
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
        '@semantic-release/github',
        ['@semantic-release/git', { assets: ['CHANGELOG.md', 'package.json'], message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}' }]
    ]
};
