export interface Registers {
  eax: number; ecx: number; edx: number; ebx: number;
  esp: number; ebp: number; esi: number; edi: number;
  eip: number; eflags: number;
  cs: number; ds: number; es: number; ss: number; fs: number; gs: number;
  cr0: number;
}

export interface DisasmLine {
  addr: number;
  len: number;
  bytes: number[];
  text: string;
}
