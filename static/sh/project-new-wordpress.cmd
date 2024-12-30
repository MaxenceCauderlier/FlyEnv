@echo off
chcp 65001>nul

if ! command -v composer &> /dev/null; then
    #command does not exist
    echo "composer does not exist"
    cd "$cachedir" || exit 1
    if [ -f "composer.phar" ]; then
      chmod 777 composer.phar
      ./composer.phar self-update
    else
      curl -sS https://getcomposer.org/installer | php
      chmod 777 composer.phar
    fi

    if [ ! -f "composer.phar" ]; then
      exit 1
    fi

    cd "$projectdir" || exit 1
    "$cachedir"/composer.phar update
else
    #command exists
    echo "composer exist"
    cd "$projectdir" || exit 1
    composer update
fi
