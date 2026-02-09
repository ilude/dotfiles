update:
  git submodule update --remote --merge
  git add -A
  git commit -m "update dotbot"
  git pull 
  git push
  ./install