# jellyfin-plugin-repo-action

A GitHub action which generates a Jellyfin plugin repository manifest file as a GitHub action.
This plugin can be used in a GitHub workflow which builds release builds or nightly prerelease builds and publishes the generated plugin repository manifest file to a selected branch.
Toghether with GitHub pages, this can form a convenient way to host the plugin repository completely on GitHub.

## Usage

To use this plugin, integrate it in your workflow. A complete example for a release build workflow is given in the [Jellyfin.Xtream publish workflow](https://github.com/Kevinjil/Jellyfin.Xtream/blob/master/.github/workflows/publish.yaml)
For detailed information about the configuration parameters, take a look at the [action.yml](action.yml) file.

## How it works

This pipeline queries the GitHub API for all releases of the given repository. This information, together with information in the git repository itself, is used as the only stateful information that this plugin uses.

For every release, the release notes are used as a changelog and the version information is extracted.
It also inspects the build artifacts to determine the download url of the plugin release by picking the asset with file extension `.zip` and the checksum by downloading the file with extension `.md5`.
Furthermore, it extracts the build information from the `build.yaml` file if it exists as release asset, and falls back to the `build.yaml` file at the release tag in the git repository.

Global plugin information such as the `guid` is extracted from the `build.yaml` file at the main branch of the repository.
