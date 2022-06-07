const core = require('@actions/core');
const github = require('@actions/github');
const stringify = require('json-stable-stringify');
const yaml = require('yaml');

/**
 * Gets and parse the yaml file at the given path in the repository.
 * @param {Octokit & Api & {paginate: PaginateInterface}} octokit The API instance.
 * @param {{owner: string, repo: string}} repo The repository information.
 * @param {string} path The path of the yaml file.
 * @param {string} ref The git ref from which to fetch the file.
 * @returns The parsed yaml file.
 */
async function getYaml(octokit, repo, path, ref = undefined) {
  const { data: file } = await octokit.rest.repos.getContent({ ...repo, path, ref });
  const contents = yaml.parse(Buffer.from(file.content, 'base64').toString('UTF-8'));
  return contents;
}

/**
 * Commit a file to the git branch.
 * @param {Octokit & Api & {paginate: PaginateInterface}} octokit The API instance.
 * @param {{owner: string, repo: string}} repo The repository information.
 * @param {string} branch The git branch on which to update the file.
 * @param {string} path The path of the yaml file.
 * @param {string} message The commit message.
 * @param {string} content The file content to commit.
 */
async function commit(octokit, repo, branch, path, message, content) {
  const { data: current } = await octokit.rest.repos.getContent({ ...repo, path, ref: `heads/${branch}` })
  const contentEncoded = Buffer.from(content).toString('base64');
  await octokit.rest.repos.createOrUpdateFileContents({
    ...repo,
    sha: current.sha,
    branch,
    path,
    message,
    content: contentEncoded,
    committer: {
      name: `github-actions[bot]`,
      email: '41898282+github-actions[bot]@users.noreply.github.com',
    },
    author: {
      name: 'github-actions[bot]',
      email: '41898282+github-actions[bot]@users.noreply.github.com',
    },
  });
}

async function run() {
  // Get input values.
  const githubToken = core.getInput('githubToken', { required: true });
  const repository = core.getInput('repository', { required: true });
  const pagesBranch = core.getInput('pagesBranch', { required: true });
  const pagesFile = core.getInput('pagesFile', { required: true });
  const ignorePrereleases = core.getBooleanInput('ignorePrereleases', { required: true });

  const octokit = github.getOctokit(githubToken);
  const repoParts = repository.split('/')
  const repo = { owner: repoParts[0], repo: repoParts[1] };

  // Get the global plugin properties using the build yaml file.
  const buildConfig = await getYaml(octokit, repo, 'build.yaml');

  // Get the release properties from the release tag and build yaml file.
  const versions = []
  const { data: releases } = await octokit.rest.repos.listReleases(repo);
  for (release of releases) {
    if (release.draft) continue;
    if (release.prerelease && ignorePrereleases) continue;

    // Use release config from tag
    let releaseConfig = await getYaml(octokit, repo, 'build.yaml', release.tag_name);

    let checksum = ''
    let sourceUrl = ''
    for (asset of release.assets) {

      if (asset.name.endsWith('.zip')) {
        // We have found the download url of the release.
        sourceUrl = asset.browser_download_url
      }
      if (asset.name.endsWith('.md5')) {
        // We have found the md5 checksum of the release.
        // The first 32 hexadecimal characters of the file are the checksum.
        const response = await octokit.request(asset.browser_download_url);
        if (response.status === 200) {
          checksum = Buffer.from(response.data, 0, 32).toString();
        } else {
          console.error('Failed to download plugin checksum: HTTP', response.status);
        }
      }

      // If build.yaml given as asset, prefer that for release config.
      if (asset.name == "build.yaml") {
        console.log(`Found release asset build.yaml, using that instead of ${release.tag_name}/build.yaml`);
        const response = await octokit.request(asset.browser_download_url);
        if (response.status === 200) {
          releaseConfig = yaml.parse(Buffer.from(response.data).toString('UTF-8'));
        } else {
          console.error('Failed to download plugin build configuration: HTTP', response.status);
        }
      }
    }

    // Store the extracted information as a plugin version.
    versions.push({
      'changelog': release.body,
      'checksum': checksum,
      'sourceUrl': sourceUrl,
      'targetAbi': releaseConfig.targetAbi,
      'timestamp': release.published_at,
      'version': releaseConfig.version,
    })
  }

  // Sort the releases in the repository descending on version number.
  versions.sort((a, b) => -a.version.localeCompare(
    b.version,
    undefined,
    { numeric: true, sensitivity: 'base' }
  ));

  // Store the extracted plugin information with version information.
  const plugin = {
    'category': buildConfig.category,
    'description': buildConfig.description,
    'guid': buildConfig.guid,
    'name': buildConfig.name,
    'overview': buildConfig.overview,
    'owner': buildConfig.owner,
    'versions': versions,
  }

  // Commit a Jellyfin plugin repository file.
  const plugin_repo = [plugin]
  const json = stringify(plugin_repo, { space: 2 });
  await commit(
    octokit,
    repo,
    pagesBranch,
    pagesFile,
    'Regenerate Jellyfin plugin repository.',
    json
  );
}

run();
