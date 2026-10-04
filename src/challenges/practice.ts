import { listedDir, readFile, submittedAnswer, type Challenge } from '../game/challenge';
import { Machine } from '../system/Machine';

/**
 * A tiny two-step challenge used to test the engine: look around, read a
 * note, submit the code inside it.
 */
export const practice: Challenge = {
  id: 'practice',
  title: 'Practice Run',
  setup() {
    const machine = new Machine('harborline');
    machine.addUser({ name: 'newhire', uid: 1001 });
    machine.fs.writeFile('/home/newhire/note.txt', 'The practice code is PRACTICE-42.\n', {
      owner: 'newhire',
      group: 'newhire',
    });
    return { machine, user: 'newhire' };
  },
  motd: 'Practice server. Type \x1b[1mhint\x1b[0m if you get stuck.\n\n',
  briefing:
    'A practice round on the [[server]]. Somewhere in your [[home directory]] is a note with a code in it. Find it, read it, and submit the code.',
  mentor: { name: 'Sam', role: 'Network team' },
  objectives: [
    {
      id: 'look',
      title: 'List the files in your home directory',
      intro:
        'Welcome! The black window on the left is a [[terminal]]. You control the server by typing a [[command]] and pressing Enter. Start by looking around: `ls` lists the files in the [[directory]] you are in.',
      outro: 'Nice. There is a file called `note.txt` here.',
      hints: ['Which command lists files?', 'Type `ls` and press Enter.', 'Run: ls'],
      completeWhen: listedDir('/home/newhire'),
    },
    {
      id: 'read',
      title: 'Read the note',
      intro: '`cat` prints what is inside a file. Put the file name after it, with a space between.',
      outro: 'Found it. Codes like this are how you prove you finished a task.',
      hints: ['Which command shows what is inside a file?', 'Use `cat` followed by the file name.', 'Run: cat note.txt'],
      completeWhen: readFile('/home/newhire/note.txt'),
    },
    {
      id: 'submit',
      title: 'Submit the code',
      intro: 'Type `submit` followed by the code to hand it in.',
      hints: ['The note contains a code.', 'Use `submit` followed by the code.', 'Run: submit PRACTICE-42'],
      completeWhen: submittedAnswer,
    },
  ],
  answer: 'PRACTICE-42',
};
