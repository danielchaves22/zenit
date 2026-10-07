type BrandProps = {
  /** Select according to the surrounding surface, not the operating system theme. */
  surface?: 'light' | 'dark';
};

export function Brand({ surface = 'light' }: BrandProps) {
  return (
    <span className={`brand brand--${surface}`}>
      <img
        className="brand-wordmark"
        src={`/assets/images/logo-${surface}.png`}
        width={surface === 'light' ? 2174 : 2170}
        height={surface === 'light' ? 723 : 725}
        alt="Zenit Bizz"
      />
      <img className="brand-symbol" src="/favicon.svg?v=2" width={40} height={40} alt="Zenit Bizz" />
    </span>
  );
}
