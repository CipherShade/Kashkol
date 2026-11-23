import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/ui/icon";

export async function LandingClassroomTicker() {
  const t = await getTranslations("Landing.ticker");

  const items = [
    { key: "item1", icon: "qr" as const },
    { key: "item2", icon: "book" as const },
    { key: "item3", icon: "bell" as const },
    { key: "item4", icon: "users" as const },
    { key: "item5", icon: "checkCircle" as const },
    { key: "item6", icon: "shield" as const },
  ];

  return (
    <section className="landing-ticker" aria-label="Classroom highlights">
      <div className="landing-ticker__viewport">
        <div className="landing-ticker__track">
          {/* First loop */}
          {items.map(({ key, icon }) => (
            <div key={`loop1-${key}`} className="landing-ticker__item">
              <span className="landing-ticker__icon" aria-hidden="true">
                <Icon name={icon} size={15} />
              </span>
              <span className="landing-ticker__text">{t(key)}</span>
            </div>
          ))}
          {/* Second duplicate loop for seamless continuous scrolling */}
          {items.map(({ key, icon }) => (
            <div key={`loop2-${key}`} className="landing-ticker__item" aria-hidden="true">
              <span className="landing-ticker__icon">
                <Icon name={icon} size={15} />
              </span>
              <span className="landing-ticker__text">{t(key)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
