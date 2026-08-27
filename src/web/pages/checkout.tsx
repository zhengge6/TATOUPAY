import { ArrowLeft, CheckCircle2, Clock3, ExternalLink, Lock, TriangleAlert } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import useSWR from "swr";
import { PAYMENT_POLL_INTERVAL_DEFAULT_SECONDS, type CheckoutData } from "@/shared/contracts";
import { swrFetcher } from "@/web/api";
import "@/web/checkout.css";

type PayMethod = "merchant" | "transfer" | "crypto";
type CheckoutStep = "method" | "pay";

function countdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function isMobileBrowser() {
  const browserNavigator = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (browserNavigator.userAgentData?.mobile === true) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(browserNavigator.userAgent) ||
    (/Macintosh/i.test(browserNavigator.userAgent) && browserNavigator.maxTouchPoints > 1);
}

function moneyCents(value: string) {
  const [yuan, fraction = ""] = value.split(".");
  return Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
}

function moneyLabel(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function CryptoStage({
  data,
  remainLabel,
  qr,
  onBack,
}: {
  data: CheckoutData;
  remainLabel: string;
  qr?: string;
  onBack: () => void;
}) {
  const charge = data.crypto;
  if (!charge) return null;
  const networkLabel = (charge.trade_type || "crypto").replace(".", " · ").toUpperCase();
  const amountText = charge.actual_amount || charge.amount;
  return (
    <div className="be-card">
        <div className="be-header">
          <div className="be-brand"><span className="be-logo">C</span>TATOUPAY</div>
        </div>
        <div className="be-amount">
          <div className="be-crypto">
            <span>{amountText}</span>
            <button type="button" className="be-copy" onClick={() => void navigator.clipboard.writeText(amountText)}>复制</button>
          </div>
          <div className="be-meta">
            <span>¥{data.payable_money}</span>
            <span className="be-network">{networkLabel}</span>
          </div>
        </div>
        <div className="be-row">
          <span className="be-fee">请严格按照数额进行付款</span>
          <span className="be-timer">到期时间 <strong>{remainLabel}</strong></span>
        </div>
        <div className="be-line" />
        <div className="be-order"><span>商户订单</span><span>{data.out_trade_no}</span></div>
        <div className="be-qr">
          {qr ? <img src={qr} alt="crypto address" width={220} height={220} /> : <p>正在生成收款码</p>}
        </div>
        <div className="be-address">
          <div className="be-address-label">
            <span>收款地址</span>
            <button type="button" className="be-copy" onClick={() => void navigator.clipboard.writeText(charge.address)}>复制</button>
          </div>
          <p>{charge.address}</p>
        </div>
        <p className="be-gas">链上代币转账的矿工费用该网络原生币支付，不要加进应付代币数量。</p>
        <button type="button" className="be-back" onClick={onBack}>选错了付款方式？返回重选</button>
        <div className="be-foot">{networkLabel}</div>
    </div>
  );
}

function MerchantStage({
  data,
  remainLabel,
  expired,
  remainMs,
  onBack,
}: {
  data: CheckoutData;
  remainLabel: string;
  expired: boolean;
  remainMs: number;
  onBack: () => void;
}) {
  const [mm, ss] = remainLabel.split(":");
  const tone = expired ? "danger" : remainMs <= 60_000 ? "warn" : "";
  return (
    <div className="ali-card">
      <div className="ali-head"><span className="ali-mark">支</span>支付宝</div>
      <div className="ali-amount">¥{data.payable_money}</div>
      <p className="ali-tip">打开支付宝扫一扫，请支付显示金额</p>
      <div className="ali-qr">
        <img src={data.business_qr_url} alt="支付宝经营码" width={220} height={220} />
      </div>
      <p className="ali-scan">使用支付宝扫码支付</p>
      <p className={`ali-count ${tone}`}>
        {expired ? "二维码已过期，请返回重新下单" : <>请在<strong>{mm}分{ss}秒</strong>内完成支付</>}
      </p>
      <button type="button" className="ali-back" onClick={onBack}>返回支付方式</button>
    </div>
  );
}

function MerchantMark() {
  return (
    <span className="inline-flex size-5 items-center justify-center rounded-[4px] bg-[var(--domain-alipay)] text-[11px] font-semibold leading-none text-white" aria-hidden="true">商</span>
  );
}

function TransferMark() {
  return (
    <span className="inline-flex size-5 items-center justify-center rounded-[4px] border border-[var(--ui-line)] text-[var(--ui-ink-2)]" aria-hidden="true">
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function CryptoMark() {
  return (
    <span className="inline-flex size-5 items-center justify-center rounded-[4px] bg-[var(--domain-usdt)] text-[10px] font-semibold leading-none text-white" aria-hidden="true">U</span>
  );
}

function RedirectHint({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex gap-3 pl-8 pr-1">
      <svg viewBox="0 0 32 24" className="mt-0.5 size-8 shrink-0 text-[var(--ui-ink-3)]" aria-hidden="true" fill="none">
        <rect x="1.5" y="4.5" width="18" height="15" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M22 12h8M26.5 8.5 30 12l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="text-sm leading-6 text-[var(--ui-ink-2)]">{children}</p>
    </div>
  );
}

function LineItem({ label, hint, value, strong }: { label: string; hint?: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-6 ${strong ? "pt-3" : ""}`}>
      <div className="min-w-0">
        <div className={strong ? "text-sm font-medium" : "truncate text-sm"}>{label}</div>
        {hint ? <div className="mt-0.5 text-xs text-[var(--ui-ink-3)]">{hint}</div> : null}
      </div>
      <div className={`shrink-0 font-mono text-sm ${strong ? "font-medium" : "text-[var(--ui-ink-2)]"}`}>{value}</div>
    </div>
  );
}

function MethodRow({
  selected,
  onSelect,
  icon,
  title,
  badge,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  badge?: string;
  children?: ReactNode;
}) {
  return (
    <div className="checkout-method">
      <button type="button" className="flex min-h-11 w-full items-center gap-3" onClick={onSelect} role="radio" aria-checked={selected}>
        <span className="checkout-radio" data-on={selected ? "true" : "false"} />
        {icon}
        <span className="text-[15px] font-medium">{title}</span>
        {badge ? <span className="ml-auto text-xs text-[var(--ui-ink-3)]">{badge}</span> : null}
      </button>
      {selected ? children : null}
    </div>
  );
}

function Summary({ data, checkoutExpired, remainLabel, requestedCents, surchargeCents, payableCents }: {
  data: CheckoutData;
  checkoutExpired: boolean;
  remainLabel: string;
  requestedCents: number;
  surchargeCents: number;
  payableCents: number;
}) {
  return (
    <section className="flex flex-col px-6 py-8 sm:px-10 lg:border-r lg:border-[var(--ui-line)] lg:px-12 lg:py-14">
      <div className="text-sm font-medium">TATOUPAY</div>
      <p className="mt-8 text-sm text-[var(--ui-ink-2)]">应付金额</p>
      <h1 className="checkout-amount mt-2 font-mono text-[48px] sm:text-[56px]">¥{data.payable_money}</h1>
      <p className="mt-3 text-sm text-[var(--ui-ink-2)]">{checkoutExpired ? "收银台已过期，正在确认" : `剩余 ${remainLabel}`}</p>
      <div className="mt-10 space-y-4 border-t border-[var(--ui-line)] pt-6">
        <LineItem label={data.name} hint={data.out_trade_no} value={moneyLabel(requestedCents)} />
        {surchargeCents > 0 ? <LineItem label="精确匹配" hint="请按合计金额支付" value={moneyLabel(surchargeCents)} /> : null}
        <LineItem label="合计" value={moneyLabel(payableCents)} strong />
      </div>
    </section>
  );
}

export function CheckoutPage() {
  const { token = "" } = useParams();
  const [now, setNow] = useState(Date.now());
  const [method, setMethod] = useState<PayMethod>("merchant");
  const [step, setStep] = useState<CheckoutStep>("method");
  const [cryptoError, setCryptoError] = useState("");
  const [cryptoBusy, setCryptoBusy] = useState(false);
  const mobileRedirectAttempted = useRef(false);
  const { data, error, isLoading, mutate } = useSWR<CheckoutData>(`/public-api/checkout/${encodeURIComponent(token)}`, swrFetcher, {
    refreshInterval: (latest) => {
      if (latest && (["paid", "late_paid"].includes(latest.status) || Date.parse(latest.monitor_until) <= Date.now())) return 0;
      return (latest?.payment_poll_interval_seconds ?? PAYMENT_POLL_INTERVAL_DEFAULT_SECONDS) * 1_000;
    },
    shouldRetryOnError: false,
  });
  const { data: transferQr } = useSWR(
    data?.payment_uri ? ["transfer-qr", data.payment_uri] : null,
    ([, uri]) => QRCode.toDataURL(uri, { width: 320, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a2540", light: "#ffffff" } }),
  );
  const { data: cryptoQr } = useSWR(
    data?.crypto?.address ? ["crypto-qr", data.crypto.address] : null,
    ([, address]) => QRCode.toDataURL(address, { width: 320, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a2540", light: "#ffffff" } }),
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (
      mobileRedirectAttempted.current ||
      !data ||
      data.collection_mode !== "transfer" ||
      data.status !== "pending" ||
      !data.payment_uri ||
      Date.parse(data.expires_at) <= Date.now() ||
      !isMobileBrowser()
    ) return;
    mobileRedirectAttempted.current = true;
    window.location.assign(data.payment_uri);
  }, [data]);

  if (isLoading) {
    return (
      <main className="checkout-root flex min-h-[100dvh] items-center justify-center px-4">
        <p className="text-sm text-[var(--ui-ink-2)]" role="status">正在读取支付订单</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="checkout-root flex min-h-[100dvh] items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <TriangleAlert className="size-6 text-[var(--ui-danger)]" />
          <h1 className="mt-4 text-xl font-medium tracking-tight">订单不存在</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--ui-ink-2)]">链接可能无效，或订单信息无法读取。</p>
        </div>
      </main>
    );
  }

  const paid = data.status === "paid" || data.status === "late_paid";
  const checkoutExpired = now >= Date.parse(data.expires_at);
  const monitoringEnded = now >= Date.parse(data.monitor_until);
  const requestedCents = moneyCents(data.requested_money);
  const payableCents = moneyCents(data.payable_money);
  const surchargeCents = payableCents - requestedCents;
  const remainLabel = checkoutExpired ? "正在确认付款" : countdown(Date.parse(data.expires_at) - now);
  const hasMerchant = Boolean(data.business_qr_url);
  const hasTransfer = Boolean(data.payment_uri);
  const hasCrypto = Boolean(data.crypto_enabled);
  const activeMethod: PayMethod = method === "crypto" && hasCrypto
    ? "crypto"
    : method === "transfer" && hasTransfer
      ? "transfer"
      : hasMerchant
        ? "merchant"
        : hasTransfer
          ? "transfer"
          : "crypto";

  async function continuePay() {
    if (activeMethod !== "crypto") {
      setStep("pay");
      return;
    }
    if (data?.crypto?.address) {
      setStep("pay");
      return;
    }
    setCryptoError("");
    setCryptoBusy(true);
    try {
      const response = await fetch(`/public-api/checkout/${encodeURIComponent(token)}/crypto`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String((payload as { message?: string }).message ?? "USDT 下单失败"));
      await mutate();
      setStep("pay");
    } catch (caught) {
      setCryptoError(caught instanceof Error ? caught.message : "USDT 下单失败");
    } finally {
      setCryptoBusy(false);
    }
  }

  if (paid) {
    return (
      <main className="checkout-root flex min-h-[100dvh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <CheckCircle2 className="size-8 text-[var(--domain-paid)]" />
          <p className="mt-5 text-sm font-medium text-[var(--domain-paid)]">{data.status === "late_paid" ? "迟到支付已确认" : "支付成功"}</p>
          <h1 className="checkout-amount mt-2 font-mono text-[40px]">¥{data.payable_money}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--ui-ink-2)]">订单 {data.out_trade_no} 已完成，商户通知正在后台投递。</p>
          {data.return_target ? (
            <a href={data.return_target} className="checkout-cta mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md text-[15px] font-medium">
              返回商户页面
              <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>
      </main>
    );
  }

  if (monitoringEnded) {
    return (
      <main className="checkout-root flex min-h-[100dvh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Clock3 className="size-6 text-[var(--ui-ink-2)]" />
          <h1 className="mt-4 text-xl font-medium tracking-tight">订单确认窗口已结束</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--ui-ink-2)]">系统未在 10 分钟内匹配到支付。请不要继续付款，并返回商户重新创建订单。</p>
          <p className="mt-6 font-mono text-xs text-[var(--ui-ink-3)]">{data.out_trade_no}</p>
        </div>
      </main>
    );
  }

  const summary = (
    <Summary
      data={data}
      checkoutExpired={checkoutExpired}
      remainLabel={remainLabel}
      requestedCents={requestedCents}
      surchargeCents={surchargeCents}
      payableCents={payableCents}
    />
  );

  return (
    <main className="checkout-root min-h-[100dvh]">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1100px] lg:grid-cols-[minmax(260px,40%)_1fr]">
        {summary}
        <section className="flex flex-col px-6 py-8 sm:px-10 lg:px-14 lg:py-14">
          {step === "method" ? (
            <>
              <h2 className="text-[20px] font-medium tracking-tight">支付方式</h2>
              <div className="checkout-methods mt-5" role="radiogroup" aria-label="支付方式">
                {hasMerchant ? (
                  <MethodRow selected={activeMethod === "merchant"} onSelect={() => setMethod("merchant")} icon={<MerchantMark />} title="商家码" badge="推荐">
                    <RedirectHint>继续后显示经营码。到账由已配置的支付宝应用密钥自动核对，请支付精确金额。</RedirectHint>
                  </MethodRow>
                ) : null}
                {hasTransfer ? (
                  <MethodRow selected={activeMethod === "transfer"} onSelect={() => setMethod("transfer")} icon={<TransferMark />} title="转账码">
                    <RedirectHint>继续后显示转账码。金额和订单号会写入支付宝转账，请勿修改备注。</RedirectHint>
                  </MethodRow>
                ) : null}
                {hasCrypto ? (
                  <MethodRow selected={activeMethod === "crypto"} onSelect={() => setMethod("crypto")} icon={<CryptoMark />} title="Crypto">
                    <RedirectHint>继续后由 BEpusdt 给出收款网络与金额。请按显示数额付款；矿工费用该链原生币，不要加进代币数量。</RedirectHint>
                  </MethodRow>
                ) : null}
              </div>
              {cryptoError ? <p className="mt-3 text-sm text-[var(--ui-danger)]">{cryptoError}</p> : null}
              <button
                type="button"
                disabled={cryptoBusy}
                className="checkout-cta mt-6 inline-flex h-12 w-full items-center justify-center rounded-md text-[15px] font-medium"
                onClick={() => void continuePay()}
              >
                {cryptoBusy ? "正在创建订单…" : "继续"}
              </button>
            </>
          ) : activeMethod === "crypto" ? (
            <CryptoStage data={data} remainLabel={remainLabel} qr={cryptoQr} onBack={() => setStep("method")} />
          ) : activeMethod === "merchant" ? (
            <MerchantStage
              data={data}
              remainLabel={remainLabel}
              expired={checkoutExpired}
              remainMs={Date.parse(data.expires_at) - now}
              onBack={() => setStep("method")}
            />
          ) : (
            <>
              <button type="button" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--ui-ink-2)]" onClick={() => setStep("method")}>
                <ArrowLeft className="size-4" />
                返回支付方式
              </button>
              <h2 className="text-[20px] font-medium tracking-tight">扫描转账码</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--ui-ink-2)]">
                将向 {data.out_trade_no} 转账 ¥{data.payable_money}。金额与备注已写入，请勿修改。
              </p>
              {transferQr ? (
                <img src={transferQr} alt="支付宝转账码" className="mt-8 size-[240px] object-contain" />
              ) : (
                <p className="mt-8 text-sm text-[var(--ui-ink-3)]">正在生成转账码</p>
              )}
              {data.payment_uri ? (
                <a href={data.payment_uri} className="checkout-cta mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md text-[15px] font-medium">
                  打开支付宝
                  <ExternalLink className="size-4" />
                </a>
              ) : null}
            </>
          )}

          {checkoutExpired ? (
            <p className="mt-4 text-sm leading-6 text-[var(--ui-ink-2)]">下单时间已过。若已付款请等待确认；若尚未付款请返回商户重新下单。</p>
          ) : null}

          {step === "method" ? (
            <p className="mt-auto flex items-center gap-2 pt-10 text-xs text-[var(--ui-ink-3)]">
              <Lock className="size-3.5" />
              由 TATOUPAY 处理 · 请勿重复支付
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
