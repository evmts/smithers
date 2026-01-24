#!/bin/bash

version="16.0.0"

base_url="https://www.unicode.org/Public/zipped/${version}"

mv ucd/.gitignore ucd-gitignore
rm -rf ucd
mkdir -p ucd/Unihan
mv ucd-gitignore ucd/.gitignore

cd ucd
curl -o ucd.zip "${base_url}/UCD.zip"
unzip ucd.zip
rm ucd.zip

cd Unihan
curl -o unihan.zip "${base_url}/Unihan.zip"
unzip unihan.zip
rm unihan.zip

echo
echo "########################################################################"
echo
echo "Done updating UCD files to version ${version}"
echo
echo "Explicitly add any new files to start parsing to the list of .gitignore"
echo "exceptions."
echo
echo "Next, flip the 'is_updating_ucd' flag in 'src/config.zig' to true, and"
echo "'zig build test' once, updating the 'default' config if it needs"
echo "changing, before flipping 'is_updating_ucd' back to false."
echo
