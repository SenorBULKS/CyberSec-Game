/**
 * Plain-language definitions for every term a beginner meets in challenge
 * text. Mark a term in messages as [[term]] or [[term|shown words]].
 */
export const GLOSSARY: Record<string, string> = {
  terminal:
    'A text window for controlling a computer by typing commands instead of clicking. System administrators and attackers both live in it.',
  command: 'An instruction you type into the terminal and run by pressing Enter, such as `ls` or `cat`.',
  prompt:
    'The text before your cursor, like `newhire@harborline:~$`. It shows who you are, which computer you are on, and which directory you are in.',
  server:
    'A computer that runs all the time to provide a service to others, such as a website, email or file storage. Usually managed through a terminal.',
  directory: 'A folder. Directories hold files and other directories.',
  'home directory':
    'Your personal directory, where your own files live. Yours is `/home/newhire`, and `~` is a shortcut for it.',
  path: 'The address of a file or directory, like `/home/newhire/welcome.txt`. Each `/` steps one level deeper.',
  'absolute path': 'A path that starts with `/`, so it works from anywhere, like `/etc/hostname`.',
  'relative path':
    'A path that starts from where you are now, like `projects/todo.txt`. `..` means "the directory above".',
  root:
    'Two meanings: the top directory `/` that contains everything, and the all-powerful administrator account, which may read and change anything.',
  user: 'An account on the computer. Every file belongs to a user, and every command runs as a user.',
  'hidden file':
    'A file whose name starts with a dot, like `.bashrc`. `ls` skips these unless you add `-a`. Hidden only means "not listed by default"; it is not protection.',
  permissions:
    'Rules saying who may read (r), write (w) and execute (x) a file. `ls -l` shows them as three groups: the owner, the group, and everyone else.',
  'shell history':
    'The shell remembers the commands you type and saves them in `~/.bash_history`, so you can recall them later with the Up arrow.',
  password: 'A secret that proves you are who you say you are. Anyone who learns it can act as you.',
  credentials: 'Anything that proves identity, such as a username and password, a key or a token.',
  'password reuse':
    'Using the same password in more than one place. When one copy leaks, every place that uses it is exposed.',
  'log file':
    'A file where a program records what it did, line by line with timestamps. Logins and SSH go in `/var/log/auth.log`; general system messages go in `/var/log/syslog`.',
  pipe:
    'The `|` symbol, which feeds one command’s output straight into the next, like `grep error log | wc -l`. It lets you build a bigger tool out of small ones.',
  'brute-force':
    'Breaking in by trying many passwords or keys until one works. In a log it looks like a burst of failed logins from one address in a short time.',
  'credential stuffing':
    'Logging in with a username and password stolen from somewhere else, betting the person reused them. Unlike brute-force guessing the password is already correct, so it can work on the first try and leaves almost no failed attempts.',
  monitoring:
    'Software that watches a system and raises an alert when something looks wrong, such as a sudden flood of failed logins.',
};

export function lookupTerm(term: string): string | undefined {
  return GLOSSARY[term.toLowerCase()];
}
