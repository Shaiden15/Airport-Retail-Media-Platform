import { describe, expect, it } from 'vitest';
import { checkText } from './sweep.mjs';

const EM_DASH = String.fromCharCode(0x2014);

describe('sweep', () => {
  it('flags em dashes, TODOs and real brands', () => {
    const findings = checkText('a.ts', `one ${EM_DASH} two\nTODO later\nfly Emirates`);
    expect(findings).toHaveLength(3);
  });

  it('flags multi-line comment blocks only in code', () => {
    expect(checkText('a.ts', '/**\n * doc\n */\nconst x = 1;')).toHaveLength(1);
    expect(checkText('a.ts', '/* short */ const x = 1;')).toHaveLength(0);
  });

  it('matches brands by exact spelling or all caps, not colour words', () => {
    expect(checkText('a.md', 'EMIRATES lounge')).toHaveLength(1);
    expect(checkText('a.tsx', "className='bg-indigo-500'")).toEqual([]);
  });

  it('passes clean text', () => {
    expect(checkText('a.ts', '// one-line note\nconst gate = "G42";')).toEqual([]);
  });
});
