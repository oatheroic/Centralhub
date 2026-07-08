import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { formatDate } from "@/lib/formatDate";
import { cn } from "@/lib/utils";
import { splitAssetUrls, getAssetFileUrl } from "@/lib/assetFiles";
import { ImageIcon, FileText } from "lucide-react";

const labelCls = "font-bold text-[color:var(--label-brown)]";
const ALL = "__ALL__";

type Row = {
  doc_no: string;
  company: string;
  department: string;
  status: string;
  assetType: string;
  assetCode: string;
  assetName: string;
  quantity: string;
  unit: string;
  valueBeforeVat: number;
  vatAmount: number;
  totalValue: number;
  purchaseDate: string;
  receiptNo: string;
  receiptDate: string;
  receiverName: string;
  receiverDepartment: string;
  newAssetImage: string;
  taxInvoiceImage: string;
};

function ViewFilesButton({
  urls, label, icon: Icon,
}: { urls: string[]; label: string; icon: typeof ImageIcon }) {
  if (urls.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {urls.map((u, i) => {
        const href = getAssetFileUrl(u);
        return (
          <Button key={i} asChild type="button" variant="outline" size="sm" className="h-7 px-2">
            <a href={href} target="_blank" rel="noreferrer">
              <Icon className="h-3.5 w-3.5 mr-1" />
              {label} {urls.length > 1 ? i + 1 : ""}
            </a>
          </Button>
        );
      })}
    </div>
  );
}


function fmt(n: number) {
  if (!n && n !== 0) return "";
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SearchableFilter({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const display = value === ALL ? "ทั้งหมด" : value || "ทั้งหมด";
  return (
    <div className="flex flex-col gap-1 min-w-[180px]">
      <Label className={labelCls}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="justify-between font-normal">
            <span className="truncate">{display}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder={`ค้นหา ${label}...`} />
            <CommandList>
              <CommandEmpty>ไม่พบ</CommandEmpty>
              <CommandGroup>
                <CommandItem onSelect={() => { onChange(ALL); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === ALL ? "opacity-100" : "opacity-0")} />
                  ทั้งหมด
                </CommandItem>
                {options.map((o) => (
                  <CommandItem key={o} value={o} onSelect={() => { onChange(o); setOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", value === o ? "opacity-100" : "opacity-0")} />
                    {o}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function InternalReport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [fCompany, setFCompany] = useState(ALL);
  const [fAssetType, setFAssetType] = useState(ALL);
  const [fAsset, setFAsset] = useState(ALL);
  const [fPurchase, setFPurchase] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [fReceiver, setFReceiver] = useState(ALL);
  const [fReceiverDept, setFReceiverDept] = useState(ALL);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("asset_purchase_requests")
        .select("doc_no,company,department,status,receive_items,asset_type,asset_code,asset_name,purchase_quantity,unit,value_before_vat,vat_amount,total_value,purchase_date,receipt_no,received_at,new_asset_image,tax_invoice_image")
        .order("created_at", { ascending: false });
      const out: Row[] = [];
      for (const r of (data ?? []) as any[]) {
        const items = Array.isArray(r.receive_items) ? r.receive_items : [];
        if (items.length > 0) {
          for (const it of items) {
            out.push({
              doc_no: r.doc_no ?? "",
              company: r.company ?? "",
              department: r.department ?? "",
              status: r.status ?? "",
              assetType: it.assetType ?? "",
              assetCode: it.assetCode ?? "",
              assetName: it.assetName ?? "",
              quantity: it.quantity ?? "",
              unit: it.unit ?? "",
              valueBeforeVat: Number(it.valueBeforeVat ?? 0),
              vatAmount: Number(it.vatAmount ?? 0),
              totalValue: Number(it.totalValue ?? 0),
              purchaseDate: formatDate(it.purchaseDate ?? ""),
              receiptNo: it.receiptNo ?? "",
              receiptDate: formatDate(it.receiptDate ?? ""),
              receiverName: it.receiverName ?? "",
              receiverDepartment: it.receiverDepartment ?? "",
              newAssetImage: it.newAssetImage ?? r.new_asset_image ?? "",
              taxInvoiceImage: it.taxInvoiceImage ?? r.tax_invoice_image ?? "",
            });
          }
        } else if (r.receipt_no || r.asset_code) {
          out.push({
            doc_no: r.doc_no ?? "",
            company: r.company ?? "",
            department: r.department ?? "",
            status: r.status ?? "",
            assetType: r.asset_type ?? "",
            assetCode: r.asset_code ?? "",
            assetName: r.asset_name ?? "",
            quantity: r.purchase_quantity ?? "",
            unit: r.unit ?? "",
            valueBeforeVat: Number(r.value_before_vat ?? 0),
            vatAmount: Number(r.vat_amount ?? 0),
            totalValue: Number(r.total_value ?? 0),
            purchaseDate: formatDate(r.purchase_date ?? ""),
            receiptNo: r.receipt_no ?? "",
            receiptDate: formatDate(r.received_at ?? ""),
            receiverName: "",
            receiverDepartment: "",
            newAssetImage: r.new_asset_image ?? "",
            taxInvoiceImage: r.tax_invoice_image ?? "",
          });
        }
      }
      setRows(out);
    })();
  }, []);

  const companies = useMemo(() => Array.from(new Set(rows.map(r => r.company).filter(Boolean))).sort(), [rows]);
  const assets = useMemo(
    () => Array.from(new Set(rows.map(r => [r.assetCode, r.assetName].filter(Boolean).join(" - ")).filter(Boolean))).sort(),
    [rows],
  );
  const assetTypes = useMemo(() => Array.from(new Set(rows.map(r => r.assetType).filter(Boolean))).sort(), [rows]);
  const purchaseDates = useMemo(() => Array.from(new Set(rows.map(r => r.purchaseDate).filter(Boolean))).sort(), [rows]);
  const statuses = useMemo(() => Array.from(new Set(rows.map(r => r.status).filter(Boolean))).sort(), [rows]);
  const receivers = useMemo(() => Array.from(new Set(rows.map(r => r.receiverName).filter(Boolean))).sort(), [rows]);
  const receiverDepts = useMemo(() => Array.from(new Set(rows.map(r => r.receiverDepartment).filter(Boolean))).sort(), [rows]);

  const filtered = rows.filter((r) => {
    if (fCompany !== ALL && r.company !== fCompany) return false;
    if (fAssetType !== ALL && r.assetType !== fAssetType) return false;
    const assetKey = [r.assetCode, r.assetName].filter(Boolean).join(" - ");
    if (fAsset !== ALL && assetKey !== fAsset) return false;
    if (fPurchase !== ALL && r.purchaseDate !== fPurchase) return false;
    if (fStatus !== ALL && r.status !== fStatus) return false;
    if (fReceiver !== ALL && r.receiverName !== fReceiver) return false;
    if (fReceiverDept !== ALL && r.receiverDepartment !== fReceiverDept) return false;
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[color:var(--label-brown)]">รายงานบันทึกภายใน</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <SearchableFilter label="บริษัท" value={fCompany} onChange={setFCompany} options={companies} />
          <SearchableFilter label="ประเภท" value={fAssetType} onChange={setFAssetType} options={assetTypes} />
          <SearchableFilter label="รหัส/ชื่อทรัพย์สิน" value={fAsset} onChange={setFAsset} options={assets} />
          <SearchableFilter label="วันเดือนปีซื้อ" value={fPurchase} onChange={setFPurchase} options={purchaseDates} />
          <SearchableFilter label="สถานะเอกสาร" value={fStatus} onChange={setFStatus} options={statuses} />
          <SearchableFilter label="ผู้รับผิดชอบทรัพย์สิน" value={fReceiver} onChange={setFReceiver} options={receivers} />
          <SearchableFilter label="แผนก (ขั้นตอนที่ 6)" value={fReceiverDept} onChange={setFReceiverDept} options={receiverDepts} />

        </div>

        <div className="overflow-x-auto border rounded-md">
          <Table className="min-w-max">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap font-bold text-emerald-600">เลขที่เอกสาร</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-emerald-600">สถานะเอกสาร</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-emerald-600">บริษัท</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-emerald-600">แผนก</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-emerald-600">ประเภท</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-blue-600">รหัส/ชื่อทรัพย์สิน</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-blue-600 text-right">จำนวน</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-blue-600">หน่วยนับ</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-blue-600 text-right">มูลค่าก่อน VAT</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-blue-600 text-right">VAT</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-blue-600 text-right">มูลค่ารวม</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-pink-700">วันเดือนปีซื้อ</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-pink-700">เลขที่ใบรับ</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-pink-700">วันเดือนปีรับ</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-pink-700">ผู้รับผิดชอบทรัพย์สิน</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-pink-700">แผนก (ขั้นตอนที่ 6)</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-pink-700">รูปทรัพย์สินที่ซื้อ</TableHead>
                <TableHead className="whitespace-nowrap font-bold text-pink-700">รูปใบกำกับภาษี</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={18} className="text-center text-muted-foreground py-6">ไม่มีข้อมูล</TableCell></TableRow>
              ) : filtered.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap text-emerald-600">{r.doc_no}</TableCell>
                  <TableCell className="whitespace-nowrap text-emerald-600">{r.status}</TableCell>
                  <TableCell className="whitespace-nowrap text-emerald-600">{r.company}</TableCell>
                  <TableCell className="whitespace-nowrap text-emerald-600">{r.department}</TableCell>
                  <TableCell className="whitespace-nowrap text-emerald-600">{r.assetType}</TableCell>
                  <TableCell className="whitespace-nowrap text-blue-600">{[r.assetCode, r.assetName].filter(Boolean).join(" - ")}</TableCell>
                  <TableCell className="whitespace-nowrap text-blue-600 text-right">{r.quantity}</TableCell>
                  <TableCell className="whitespace-nowrap text-blue-600">{r.unit}</TableCell>
                  <TableCell className="whitespace-nowrap text-blue-600 text-right">{fmt(r.valueBeforeVat)}</TableCell>
                  <TableCell className="whitespace-nowrap text-blue-600 text-right">{fmt(r.vatAmount)}</TableCell>
                  <TableCell className="whitespace-nowrap text-blue-600 text-right">{fmt(r.totalValue)}</TableCell>
                  <TableCell className="whitespace-nowrap text-pink-700">{r.purchaseDate}</TableCell>
                  <TableCell className="whitespace-nowrap text-pink-700">{r.receiptNo}</TableCell>
                  <TableCell className="whitespace-nowrap text-pink-700">{r.receiptDate}</TableCell>
                  <TableCell className="whitespace-nowrap text-pink-700">{r.receiverName}</TableCell>
                  <TableCell className="whitespace-nowrap text-pink-700">{r.receiverDepartment}</TableCell>
                  <TableCell className="whitespace-nowrap"><ViewFilesButton urls={splitAssetUrls(r.newAssetImage)} label="ดูรูป" icon={ImageIcon} /></TableCell>
                  <TableCell className="whitespace-nowrap"><ViewFilesButton urls={splitAssetUrls(r.taxInvoiceImage)} label="ดูไฟล์" icon={FileText} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="text-sm text-muted-foreground">รวม {filtered.length} รายการ</div>
      </CardContent>
    </Card>
  );
}
