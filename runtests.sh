nyc ./node_modules/.bin/mocha -R spec
nodever=$(node --version)
if ! [[ $nodever =~ 'v6.' ]]; then
    wjsh=$(which jshint)
    echo $wjsh
    if [[ -z $wjsh ]]; then
        npm install -g jshint
    fi
    pushd codequality
    node diffErrors.js
    popd
fi
