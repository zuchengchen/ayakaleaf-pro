const services = require('./services')

console.log('#!/bin/bash')
console.log('set -ex')

switch (process.argv.pop()) {
  case 'install':
    console.log('yarn workspaces focus --all --production')
    break
  case 'compile':
    for (const service of services) {
      console.log('pushd', `services/${service.name}`)
      switch (service.name) {
        case 'web':
          // precompile pug in background
          console.log('yarn run precompile-pug &')
          console.log('pug_precompile=$!')

          // Avoid downloading of cypress
          console.log('export CYPRESS_INSTALL_BINARY=0')

          // install webpack and frontend dependencies
          console.log('yarn install || yarn install || yarn install')
          // list the translation keys the frontend uses, webpack bundles only those
          console.log('yarn run extract-translations')
          // run webpack
          console.log('yarn run webpack:production')
          // fetch Pyodide wheel bundle (numpy/matplotlib/etc.) for the python-runner module
          console.log('yarn run pyodide:fetch')
          // uninstall webpack and frontend dependencies
          console.log('yarn workspaces focus --all --production')

          // Wait for pug precompile to finish
          console.log('wait "$pug_precompile"')
          break
        default:
          console.log(`echo ${service.name} does not require a compilation`)
      }
      console.log('popd')
    }
    // LOCAL: `yarn workspaces focus --production` keeps the dev-only zips (webpack,
    // storybook, other-platform binaries, ...) in .yarn/cache; drop every zip
    // that .pnp.cjs no longer references
    console.log(
      `node -e 'const fs = require("fs"); const pnp = fs.readFileSync(".pnp.cjs", "utf8"); for (const f of fs.readdirSync(".yarn/cache")) if (!pnp.includes(f)) fs.rmSync(".yarn/cache/" + f)'`
    )
    break
  default:
    console.error('unknown command')
    console.log('exit 101')
    process.exit(101)
}
