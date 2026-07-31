; PASTE.COM - WebNP2 ホスト側テキスト送信 TSR (PC-98 / MS-DOS 実モード)
;
; 目的:
;   NEC MS-DOS の CON ドライバはキーボード入力の 0x80-0x9F を破棄するため、
;   キーボードBIOSバッファへの注入では全角(Shift_JIS)文字がゲストに届かない。
;   本TSRは DOS の文字入力ファンクション(INT 21h)をフックし、常駐メモリ内の
;   メールボックス(リングバッファ)から文字を供給することで、CONドライバより
;   上流でホストの文字列を注入する。
;
; ホスト(WebNP2)との連携:
;   ホストはゲスト物理メモリから 'WEBNP2MB' シグネチャを走査して
;   メールボックス構造体を見つけ、buf へ直接バイトを書いて tail を進める。
;   1行分を書き終えるまで pending=1 にしておくと、TSR は行が揃うまで待機する。
;
; ビルド: nasm -f bin paste.asm -o PASTE.COM

        cpu     8086
        org     0x100

BUFSIZE         equ 256
IDENT_FUNC      equ 0xE7E7      ; INT 21h AX=E7E7 で常駐確認
IDENT_REPLY     equ 0x4B57      ; 応答 'WK'

start:  jmp     install

;--------------------------------------------------------------------
; 常駐データ (ホストが 'WEBNP2MB' を走査して見つける)
;--------------------------------------------------------------------
        align   2
mailbox:
sig:            db 'WEBNP2MB'
head:           dw 0            ; 読み出し位置 (TSRが進める)
tail:           dw 0            ; 書き込み位置 (ホストが進める)
bufsize:        dw BUFSIZE
pending:        dw 0            ; 1=ホストが1行を書き込み中(TSRは待機する)
installed:      dw 0            ; 常駐時に IDENT_REPLY を書く。ディスクバッファ等に
                                ; 残る PASTE.COM のコピー(この値は0のまま)と区別するため
buf:            times BUFSIZE db 0
oldint21:       dd 0

;--------------------------------------------------------------------
; 内部ヘルパー
;--------------------------------------------------------------------

; メールボックスが空なら ZF=1。フラグ以外は破壊しない。
check_empty:
        push    ax
        mov     ax, [cs:head]
        cmp     ax, [cs:tail]
        pop     ax
        ret

; 1バイト取り出して AL へ。空でないことが前提。
getbyte:
        push    bx
        mov     bx, [cs:head]
        mov     al, [cs:bx+buf]
        inc     bx
        cmp     bx, [cs:bufsize]
        jb      .store
        xor     bx, bx
.store:
        mov     [cs:head], bx
        pop     bx
        ret

; データが来るまで待つ。
;   CF=1 … データあり
;   CF=0 … データ無し かつ ホストは送信中でない (=通常のキーボードへ委ねる)
wait_data:
        call    check_empty
        jne     .have
        cmp     word [cs:pending], 0
        je      .none
        ; ホストが行を書き込み中。割り込みを有効にしたまま待つ
        ; (ホスト側JSはフレーム境界でメモリを書き込む)。
        sti
        nop
        nop
        jmp     wait_data
.have:
        stc
        ret
.none:
        clc
        ret

; AL の文字を DOS の画面出力(AH=02h)でエコーする。
echo_al:
        push    ax
        push    dx
        mov     dl, al
        mov     ah, 0x02
        pushf
        call    far [cs:oldint21]
        pop     dx
        pop     ax
        ret

;--------------------------------------------------------------------
; INT 21h ハンドラ
;--------------------------------------------------------------------
newint21:
        cmp     ax, IDENT_FUNC
        je      .ident
        cmp     ah, 0x0A
        je      .buffered
        cmp     ah, 0x01
        je      .single_echo
        cmp     ah, 0x07
        je      .single_noecho
        cmp     ah, 0x08
        je      .single_noecho
        cmp     ah, 0x3F
        je      .readfile
.chain:
        jmp     far [cs:oldint21]

.ident:
        mov     ax, IDENT_REPLY
        iret

; AH=07h/08h: エコー無し1文字入力
.single_noecho:
        call    wait_data
        jnc     .chain
        call    getbyte
        iret

; AH=01h: エコー有り1文字入力
.single_echo:
        call    wait_data
        jnc     .chain
        call    getbyte
        call    echo_al
        iret

; AH=0Ah: 行入力 (DS:DX = [最大長][実長][文字...])
; COMMAND.COM のコマンドライン入力がこれ。
.buffered:
        call    wait_data
        jnc     .chain
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        mov     bx, dx
        mov     cl, [bx]                ; 最大長
        xor     ch, ch
        mov     si, 2                   ; 書き込みオフセット
        xor     dx, dx                  ; 現在の文字数
        or      cx, cx
        jz      .b_done
        dec     cx                      ; 終端CR用に1バイト残す
.b_loop:
        call    wait_data
        jnc     .b_done
        call    getbyte
        cmp     al, 0x0D
        je      .b_done
        cmp     dx, cx
        jae     .b_loop                 ; 溢れた分はCRまで捨てる
        mov     [bx+si], al
        inc     si
        inc     dx
        call    echo_al
        jmp     .b_loop
.b_done:
        mov     byte [bx+si], 0x0D      ; DOSの仕様として終端はCR
        mov     [bx+1], dl              ; 実文字数
        mov     al, 0x0D
        call    echo_al
        mov     al, 0x0A
        call    echo_al
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        iret

; AH=3Fh (BX=0, 標準入力): ハンドル入力
.readfile:
        or      bx, bx
        jnz     .chain
        call    wait_data
        jnc     .chain
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        mov     si, dx                  ; DS:SI = 転送先
        xor     di, di                  ; 転送済みバイト数
.r_loop:
        cmp     di, cx
        jae     .r_done
        call    wait_data
        jnc     .r_done
        call    getbyte
        mov     [si], al
        inc     si
        inc     di
        cmp     al, 0x0D
        jne     .r_loop
        cmp     di, cx                  ; CON と同様に CR の後に LF を足す
        jae     .r_done
        mov     byte [si], 0x0A
        inc     si
        inc     di
.r_done:
        mov     ax, di
        pop     di
        pop     si
        pop     dx
        pop     cx
        pop     bx
        ; 成功を示すため、戻り先フラグの CF をクリアする
        push    bp
        mov     bp, sp
        and     word [bp+6], 0xFFFE
        pop     bp
        iret

;--------------------------------------------------------------------
; インストール処理 (常駐後は破棄される)
;--------------------------------------------------------------------
install:
        mov     ax, IDENT_FUNC
        int     0x21
        cmp     ax, IDENT_REPLY
        jne     .install_now
        mov     dx, msg_already
        mov     ah, 0x09
        int     0x21
        mov     ax, 0x4C01
        int     0x21

.install_now:
        mov     ax, 0x3521              ; 元の INT 21h ベクタを取得
        int     0x21
        mov     [oldint21], bx
        mov     [oldint21 + 2], es

        mov     dx, newint21            ; 自前ハンドラを設定
        mov     ax, 0x2521
        int     0x21

        mov     word [installed], IDENT_REPLY   ; 常駐コピーである印

        mov     dx, msg_ok
        mov     ah, 0x09
        int     0x21

        mov     dx, (install - start + 0x100 + 15) / 16 ; PSPを含む常駐パラグラフ数
        mov     ax, 0x3100              ; 常駐終了
        int     0x21

msg_ok:         db 'WebNP2 paste TSR installed.', 0x0D, 0x0A, '$'
msg_already:    db 'WebNP2 paste TSR already resident.', 0x0D, 0x0A, '$'
