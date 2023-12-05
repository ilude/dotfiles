update:
  git submodule update --remote --merge
  git aa
  git ci "update dotbot"
  git pull 
  git push
  ./install