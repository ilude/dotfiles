-- Minimal Neovim cockpit trial config.
-- Goal: simple file tree + sane basics, not a full Neovim distribution.

vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.mouse = 'a'
vim.opt.termguicolors = true
vim.opt.clipboard = 'unnamedplus'
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.splitright = true
vim.opt.splitbelow = true
vim.opt.signcolumn = 'yes'
vim.opt.updatetime = 250

-- Bootstrap lazy.nvim plugin manager.
local lazypath = vim.fn.stdpath('data') .. '/lazy/lazy.nvim'
if not vim.uv.fs_stat(lazypath) then
  vim.fn.system({
    'git',
    'clone',
    '--filter=blob:none',
    'https://github.com/folke/lazy.nvim.git',
    '--branch=stable',
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

require('lazy').setup({
  {
    'nvim-neo-tree/neo-tree.nvim',
    branch = 'v3.x',
    dependencies = {
      'nvim-lua/plenary.nvim',
      'MunifTanjim/nui.nvim',
      'nvim-tree/nvim-web-devicons',
    },
    keys = {
      { '<leader>e', '<cmd>Neotree toggle reveal left<cr>', desc = 'Toggle file tree' },
    },
    opts = {
      close_if_last_window = false,
      -- Avoid repeated background `git status --porcelain` calls from neo-tree.
      enable_git_status = false,
      filesystem = {
        follow_current_file = { enabled = true },
        use_libuv_file_watcher = false,
        filtered_items = {
          visible = false,
          hide_dotfiles = false,
          hide_gitignored = false,
        },
      },
      window = {
        position = 'left',
        width = 25,
      },
    },
  },
}, {
  checker = { enabled = false },
  change_detection = { notify = false },
})

-- Cockpit-ish keymaps.
vim.keymap.set('n', '<leader>e', '<cmd>Neotree toggle reveal left<cr>', { desc = 'Toggle file tree' })
local function open_pi_terminal(start_insert)
  vim.cmd('belowright split')
  vim.cmd('resize 35')
  local shellcmd = [[pwsh -NoLogo -NoExit -Command "Write-Host 'Loading Pi...' -ForegroundColor Cyan; pi"]]
  vim.cmd('terminal ' .. shellcmd)
  if start_insert then
    vim.cmd('startinsert')
  end
end

vim.keymap.set('n', '<leader>p', function()
  open_pi_terminal(true)
end, { desc = 'Open Pi terminal below' })
vim.keymap.set('n', '<leader>q', '<cmd>quit<cr>', { desc = 'Quit window' })
vim.keymap.set('n', '<leader>w', '<cmd>write<cr>', { desc = 'Save file' })
vim.keymap.set('n', '<leader>h', '<C-w>h', { desc = 'Focus left pane' })
vim.keymap.set('n', '<leader>j', '<C-w>j', { desc = 'Focus lower pane' })
vim.keymap.set('n', '<leader>k', '<C-w>k', { desc = 'Focus upper pane' })
vim.keymap.set('n', '<leader>l', '<C-w>l', { desc = 'Focus right pane' })

-- Open the tree and Pi terminal automatically when starting nvim on a directory.
-- Use Lua APIs and schedule after startup so first-run/plugin-load timing does
-- not fail during VimEnter.
vim.api.nvim_create_autocmd('VimEnter', {
  callback = function()
    if vim.fn.argc() == 1 and vim.fn.isdirectory(vim.fn.argv(0)) == 1 then
      vim.schedule(function()
        pcall(function()
          require('lazy').load({ plugins = { 'neo-tree.nvim' } })
          require('neo-tree.command').execute({ action = 'show', position = 'left', reveal = true })
          vim.cmd('wincmd l')
          open_pi_terminal(false)
          vim.cmd('wincmd k')
        end)
      end)
    end
  end,
})
