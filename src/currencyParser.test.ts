import { describe, test, expect } from 'vitest'
import { parseNorwegianCurrency, extractStructuredFields } from './utils/currencyParser'

/**
 * Currency Parser Tests
 * 
 * This test suite validates Norwegian receipt parsing with real OCR data.
 * OCR test cases use actual Tesseract.js output to ensure parsing robustness
 * against real-world recognition errors and noise.
 */

describe('Norwegian Currency Parser', () => {
    describe('Norwegian format with comma as decimal separator', () => {
        test('should parse simple Norwegian decimal format', () => {
            expect(parseNorwegianCurrency('123,45')).toBe(123.45)
            expect(parseNorwegianCurrency('1,99')).toBe(1.99)
            expect(parseNorwegianCurrency('999,00')).toBe(999.00)
        })

        test('should parse Norwegian format with thousands separator', () => {
            expect(parseNorwegianCurrency('1.234,56')).toBe(1234.56)
            expect(parseNorwegianCurrency('12.345,67')).toBe(12345.67)
            expect(parseNorwegianCurrency('123.456,78')).toBe(123456.78)
        })

        test('should parse Norwegian format with spaces as thousands separator', () => {
            expect(parseNorwegianCurrency('1 234,56')).toBe(1234.56)
            expect(parseNorwegianCurrency('12 345,67')).toBe(12345.67)
        })
    })

    describe('International format with dot as decimal separator', () => {
        test('should parse simple international decimal format', () => {
            expect(parseNorwegianCurrency('123.45')).toBe(123.45)
            expect(parseNorwegianCurrency('1.99')).toBe(1.99)
            expect(parseNorwegianCurrency('999.00')).toBe(999.00)
        })

        test('should parse international format with comma thousands separator', () => {
            expect(parseNorwegianCurrency('1,234.56')).toBe(1234.56)
            expect(parseNorwegianCurrency('12,345.67')).toBe(12345.67)
            expect(parseNorwegianCurrency('123,456.78')).toBe(123456.78)
        })
    })

    describe('Edge cases and ambiguous formats', () => {
        test('should handle integers without decimal separators', () => {
            expect(parseNorwegianCurrency('123')).toBe(123)
            expect(parseNorwegianCurrency('1234')).toBe(1234)
        })

        test('should handle thousands separators only', () => {
            expect(parseNorwegianCurrency('1.234')).toBe(1234) // Treated as thousands separator
            expect(parseNorwegianCurrency('1,234')).toBe(1234) // Treated as thousands separator
        })

        test('should handle whitespace', () => {
            expect(parseNorwegianCurrency(' 123,45 ')).toBe(123.45)
            expect(parseNorwegianCurrency('\t1.234,56\n')).toBe(1234.56)
        })

        test('should return undefined for invalid inputs', () => {
            expect(parseNorwegianCurrency('')).toBe(undefined)
            expect(parseNorwegianCurrency('abc')).toBe(undefined)
        })
    })

    describe('Real-world Norwegian receipt examples', () => {
        test('should parse typical Norwegian grocery store prices', () => {
            expect(parseNorwegianCurrency('12,90')).toBe(12.90)  // Milk price
            expect(parseNorwegianCurrency('45,50')).toBe(45.50)  // Bread price
            expect(parseNorwegianCurrency('234,75')).toBe(234.75) // Larger item
        })

        test('should parse Norwegian receipt totals with thousands', () => {
            expect(parseNorwegianCurrency('1.245,80')).toBe(1245.80)  // Large shopping total
            expect(parseNorwegianCurrency('2.150,00')).toBe(2150.00)  // Even larger total
        })

        test('should handle Norwegian VAT amounts', () => {
            expect(parseNorwegianCurrency('187,96')).toBe(187.96)  // 25% VAT on 751,84
            expect(parseNorwegianCurrency('45,00')).toBe(45.00)    // VAT on 180,00
        })
    })

    describe('Receipt line item parsing compatibility', () => {
        test('should handle prices with quantity patterns', () => {
            expect(parseNorwegianCurrency('25,90')).toBe(25.90)  // 2x12,95 scenario
            expect(parseNorwegianCurrency('15,00')).toBe(15.00)  // 3*5,00 scenario
        })
    })
})

/**
 * Receipt Text Extraction Tests
 * 
 * IMPORTANT: Real-world OCR test cases are based on Tesseract.js OCR engine output.
 * 
 * OCR Test Data Context:
 * - OCR Engine: Tesseract.js (version ~5.0.x)
 * - Language Settings: Norwegian + English ('nor+eng')
 * - Input Format: Mobile phone camera photos of physical receipts
 * - OCR Quality: Real-world noisy output with typical recognition errors
 * 
 * MAINTENANCE NOTE: If OCR engine/version is upgraded, these test cases may need
 * to be regenerated with new OCR output to maintain realistic parsing challenges.
 * The anonymized test data preserves merchant names, prices, and structural
 * elements while removing personal information (customer names, card numbers, etc.)
 * 
 * Test Data Sources:
 * - Antonsport (Sports store): Norwegian receipt, shoes purchase
 * - Biltema Norge (Hardware store): Norwegian receipt, plumbing supplies
 */
describe('Receipt Text Extraction', () => {
    test('should extract Norwegian receipt with comma decimals', () => {
        const receiptText = `
COOP PRIX
Storgata 123
Oslo

Melk                    12,90
Brød                    25,50
Ost                     89,75

Sum                    128,15
MVA 25%                 25,63
Totalt å betale        128,15
    `.trim()

        const result = extractStructuredFields(receiptText)
        expect(result.total).toBe(128.15)
        expect(result.vatAmount).toBe(25.63)
        expect(result.currency).toBe('NOK')
        expect(result.merchant).toBe('COOP PRIX')
    })

    test('should extract Norwegian receipt with thousands separator', () => {
        const receiptText = `
REMA 1000
Hovedgata 456

Diverse varer         1.245,80
MVA                     249,16
Sum å betale          1.245,80
    `.trim()

        const result = extractStructuredFields(receiptText)
        expect(result.total).toBe(1245.80)
        expect(result.vatAmount).toBe(249.16)
        expect(result.merchant).toBe('REMA 1000')
    })

    test('should extract receipt with period decimal separator', () => {
        const receiptText = `
Local Store
Main Street 789

Item 1                  123.45
Item 2                  67.89
Total                   191.34
VAT                     38.27
    `.trim()

        const result = extractStructuredFields(receiptText)
        expect(result.total).toBe(191.34)
        expect(result.vatAmount).toBe(38.27)
        expect(result.merchant).toBe('Local Store')
    })

    test('should handle mixed format receipts', () => {
        const receiptText = `
ICA Supermarket
Storveien 12A

Bananer 1kg             23,90
Kaffe premium         1.125,00
Juice 2L                45.99

Totalt                1.194,89
MVA 25%                 238,98
    `.trim()

        const result = extractStructuredFields(receiptText)
        expect(result.total).toBe(1194.89)
        expect(result.vatAmount).toBe(238.98)
        expect(result.merchant).toBe('ICA Supermarket')
    })

    test('should detect foreign currency', () => {
        const receiptText = `
Duty Free Shop
Terminal 2

Item 1                  50.00 EUR
Item 2                  75.50 EUR
Total                  125.50 EUR
    `.trim()

        const result = extractStructuredFields(receiptText)
        expect(result.currency).toBe('EUR')
        expect(result.total).toBe(125.50)
    })

    test('should handle receipts with org.nr for merchant detection', () => {
        const receiptText = `
Bakeri AS
Gateveien 45
0123 Oslo
Org.nr: 123456789

Rundstykker             25,00
Kaffe                   30,00

Sum                     55,00
    `.trim()

        const result = extractStructuredFields(receiptText)
        expect(result.merchant).toBe('Bakeri AS')
        expect(result.total).toBe(55.00)
    })

    test('should extract from noisy OCR text - Antonsport receipt', () => {
        // Real OCR output from Antonsport receipt with lots of noise (anonymized)
        // Generated with: Tesseract.js ~5.0.x, language: 'nor+eng', mobile camera input
        // Date captured: August 2025 - UPDATE THIS if OCR engine changes significantly
        const noisyOcrText = `* | PP | pg å ; - hor 4 x 4» ; de Å 14 * Fa vy PA ATI Va CVT oR TY ERR UY AE ERAT LAS RANT ed Thy LANTERN TA Hg A
hy | Å, å TN ET RE 2 EE ASAT A Fe
Å ; hia å wo Sdn SEEN Le et EE SE RAS AER
y 1.9 ' \\ ' i" Ja ve i ) FE ANAND TX 178 RAY A ALN AAR Av
Ah NE i ; Hå Sn OAT EN BOM Ah ACREAGE ie Eee
PRE PA . ; : Sok A UP A TG TRANG RRO HE BRR ER Ben
dar, pe Te IR iY Th RR NT
| ; ; & co ARE LEER A TREE N
can > REAR RE ER
SEE ETE he OE a VRE
LIAL GA na by i) ne Gar RE
RNR LEC AL BR GR ET ANTONSPORT RE eee
I Se CH, BU Ee aR Gee
RAE ne Go nok snakk EE BR SNe
Sia AeA ah Ea å QED AR ERR SE
At saad Å ALTONA INN RA ES AN
ATARI La : a EE eR RR
Re SR CE EH wale eT
SAL sl ee La ; A A RE ER RO
å FEAR tn å Å "a Lagerveien | NK GE ge Ee
Sol FTG Re sts 4033 Stavanger SRR ER eV
5 SOLE Hs alee GA ey TELEFON 51 80 12 26 Ge ET Re
A hi 2) on BR Butikk 11549-1, Customer Name SINT Cg Salen
Ca Pa OR DIE SERRE a Salgskvittering 128612 2025-08-27 13:32 FY AE ea
. i JB 9 Å Array veit åra KAM Le Se ON de
DNG fed NE lt LS Ref: 11549-2-83663 NN regia ge
po, PERS SA kg 3 Pa å » Hos VE eed RA ta 6 >
BANE hae a SEL NIKE VOMERO PLUS 1 990.00 [NEESEEEESERSTS
BOE PR 0031424665 WHITE/BLACK-BRIGHT CRIMSON 10 A SSR CE AE
HI pA t x 3 PR pA LA p 7
¢ om Fa Å - A . ¢ ' ftp st ' en es
EIR Ne å Totalt (1 Artikkel) 1999.0 EE
SRR Sr San Bank: 1 999.00 [NSENSHEREER
- -n > $ tg ; SY ste pa
Rel FE Sew Mobo Sportsholding AS SE fom
5 oe Sta Es De TR Lagerveien 9 plier oar Ei
"ar FA NVE VASER Stavanger en EE Soh
es at Hato Eo had Bus.Reg.No: 981006747 2025-08-27 13:33 REE Ee al So
EO Tr Bes SÆ PURCHASE NOK 1999.00 BankAxept PSN:00 Ke
yg) sæ hoa IN TA CONTACTLESS XXXX XXXX XXXX XXX3 917 uk Ge Le HARB GE =
Rg ; TERM:  05933041-053031 NETSNO 1033272 KC1 Ener.
2 +26" la 0 -+ AED: AID: D5780000021010 [Sc
$i am ng al ARC: 00 STATUS:000 AUTH CODE: 407151 [RE
i AE EE ER REF : 053031 Result: AUTHORIZED et Ea
a Bn ae KEEP RECEIPT TERT ee
pr A A CARDHOLDER 'S RECEIPT BERGE CO ee : å
or. > »- ;, r o 3 : he | PA . * >
Bo ARNE ho MVA-grunnlag | MVA-% MVA Sum Ad fT Eat tN kn
es 7 A be >» gr rer si pg - N
ass nl bgp ek, 1599.20 25% 399.80 1999.00 EROS RS
Xa $s å . NE & :
jr WE § PA : å eta le SEE Sr Ne 4 gre å
RESPIR ERR Medlemsnr. XXXXXXXXX SA AP ee
2 2% A Ne he $ å Å Ar 3 Euroen de -
Fg Er Takk for besøket aR Ni Te 0
Soi (0 BG « Velkommen tilbake! ; NL -:
På Wi ta |» i Han ut oe
; ig fre ORG.NR: NO 981 006 747 MVA BRC A A Nt
bo TEEPE Sh Es" 3 LR, Oi ne I
LP å DÆ fy ; sh : ØRS gpa Ts Tale
wp NTE Ta 14 dager åpent kjøp mot fremvisning Sala DG
fe sma RT av kvittering. FE Se ri
PRIN SE 2, Ara Ved retur av varer må emballasje Pape GK AN
å å vi Ae og merkelapper være intakt. ba; ve DL
Ka å VAGN EG Spesialtilpassede produkter byttes ikke. ba RT EL
Ry gi må Se Wwww.antonsport.no for mer informasjon pk Nes ae a`

        const result = extractStructuredFields(noisyOcrText)

        // Should extract merchant name despite OCR noise
        expect(result.merchant).toBe('ANTONSPORT')

        // Should find the correct total amount despite multiple price formats
        expect(result.total).toBe(1999.00)

        // Should extract VAT amount correctly
        expect(result.vatAmount).toBe(399.80)

        // Should detect NOK currency
        expect(result.currency).toBe('NOK')
    })

    test('should extract from noisy OCR text - Biltema receipt', () => {
        // Real OCR output from Biltema hardware store receipt with lots of noise (anonymized)
        // Generated with: Tesseract.js ~5.0.x, language: 'nor+eng', mobile camera input
        // Date captured: August 2025 - UPDATE THIS if OCR engine changes significantly
        const biltemaOcrText = `bø mm TA BAB PB Å vi % Veé - sjå AR : å $A > Å - ; pp ; ve pi ; $ er FE /
å ha å å | % Å 9. tg ; å ] 4 3 pi £E 4 94 pb:
åra ør it i å Å > ka ja fø yr Ä - ! pe) å 1: ; p
å AK vÆ Å 4 på LA Pa " å » seg 48; ; é å
vi Å OE Vel Or) OR RE ; te ie te LAN EN
ie å Å AL Tal ao Biltema Norge avd 203 Stavanger HØTT NN PAA :
2 al ft, NL bane. Maskinveien 1. 4033-Stavanger ØL Å ; pe
: HE SA he SA År er ir Foretaksregisteret NO 882692302 MVA sr he Øk
DAA Ed an pre Or Å Kam Åpningstider: 7-21 (9-19) Tlf:22 22 20 22 Sadie og Å
5 NOG ! | Å på ; 594 set > å; 49585 v AG / f 4. - >
Dr SALGSKVITTERING ØM
: gn eg dos SN 21 AL DE ; EA ADARE Jaetklkety EA
TMV Pa Butikknr. 205 — et
AP ANE EE le. Butikknavn Stavanger slank, Å JR å RAA ge
re OG Kvitt. 10578 26.08.2025 14:04:55 1 NE ANNA RE
APS SVA ØP fer ha Term. nr. 201 Bs AR TATE
BADE. S Å ring i VOR bk Må Operatørnavn Customer User 6 64 MDG ee 24
EP EAS ENE AT dad Herav mva 82.10 Ant. varer 6 ROA kl DO
€. pi ft Å ; "8 væ Sos 4 ei Å Pa DE Ear PSV IME Re 4 5 REE Lg Å, å Eg ts 29,84 LÅ FN å
NAS TNT ER KEN 872100 VANNALARM Øse AT LA
Fogn ANNI GR le. 1 * 149,00 149.00 18! EL VAA
en Va 877632 Y-KOBLING FOR AVLØPSSLANGE DE KE
i > - øl de > Re % å ; Å , 258. 1 * 89.90 89.90 z 2 ; > ; ar le RR 5
fa mv HØR 1 OA 879927 KOBLING OVERGANG. 3/4" X 1/2" 6, Fa NN
NN, PANNE 1 * 36.90 36.90 gen al hv
13) AN) dpi ARGE am) 879970 T-KOBLING. HAN. 1/9" rå il 108 NAP ØRA
Per AE gl MN 1 * 44.90 44.90 GÅ WE Fe
JE ha TN IR VER 879952 MUFFE. 1/2" Øl MEAN
He AT Ea AN l * 39.90 39.90 BP
elva eig ASA BA 879946 REDUKSJONSNIPPEL 1/2" X 3/4" ep Pet Nr UV
Eeg sr SRG AE 4 BE 49.90 Vg Et AEE
> LS NR VG Då åå KØ AN NL Å et å ti Å RS er
45 GE At NL AG TR TOTALT Å BETALE 410.50 ere ee
Pan Mus DØ EN 3 BANK 410.50 87 AL At å:
. > je ad SE Fo AR KE VARE JADE lo MORENE Sin Dre NENNE ; NE AND ANE DEN Ai Pdøge eg ar
rak > Eten pet å - > KATT Nene. ve s. ; i " - Å, Æ pe :
ke VO NLA Or Chat ioat peL K POE MVAZ Grunnlag MVA Totalt ver Na
|. PE DER å) 46 EP et Far 4 5 Srl EA Aa
Sark dr % % Å ;» 4 5 På Sm 6 Å I 2 Ov å een re OR mm le As ; < å - 2 TÆR å å '
pl PE LE Mr Ne 25.00 328.40 821088 2410. 50 Digre ee
; AM Re) ma Å 3" ml Å ? tett ir Da ha te hole ST Lt EA EA Ve ur » aa > ge 2 ud. ;:
EA AT Ay BD AKON
EET EVE EVE sa: XXXXXX-XXXXXXX pep se
ee 25/08/2025 14:04 Overf. :966 ae ie
ph JG År VTA  BankAkept Contactless  *XXXXXXXXX gen Sr
AEE i D: D5780000021010 KEM
VEE eSv ETNE nef.: 546100 407147 KC1 TVR:8000008000 UGA AN GE RØN
FAR SE VU, DA XT ea at Ree | Resp..:-00 Aer Å em Seat
SOVNE AVR or NOK 410,50 sin PN
Ps EE EN AE | LUDKJEN] LSA De
har ER he % » i å ; å ; *, VS 2 IA å DAG
) å Å pp 72 4 >- > Q 4 Å tå ha
te 0 BANDA SG
AL Lt ae. 5 AR XXXXXXXXXXXXXXX AEK Ha
GE SØ!) Å Ap oe PORN : TT AVIS NE
MA AN ØL EINAR, Apent kjøp 1 30 dager mot ubrutt forpaknine. DO Aa. Å
HAAVIK Er ANKRE AG EA Kvittering gjelder som garantibevis og skal KONAN NM OG
v FA RA SEAN medbrlnges Ved reklamasjon eller tilbakekjop, | MRNRRE NAN
å Mr, VAL) As 1 LE TE å Takk for handelen og velkommen tilbake. BONN RE ANNE EN
9 Ä Å Å tå bk AK An RX v AR *. PN A
OE Am yt vekar TOG LUNA EE Å ANAND DN NN NN
; Fe pa ;; Å : ; » i 1,0 og » | i I » / ML ' åå ÆR » p NM ) X
9 : 4 $ ; É Å j ' % X b i ; ( ] MA 3) X å » FN å p) MG i mm å Ep"`

        const result = extractStructuredFields(biltemaOcrText)

        // Should extract Biltema as merchant name despite OCR noise
        expect(result.merchant).toBe('Biltema Norge')

        // Should find the correct total amount (410.50)
        expect(result.total).toBe(410.50)

        // Should extract VAT amount correctly (82.10 based on "Herav mva 82.10")
        expect(result.vatAmount).toBe(82.10)

        // Should detect NOK currency
        expect(result.currency).toBe('NOK')
    })
})
