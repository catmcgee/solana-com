"use client";

import { useTranslations } from "next-intl";
import {
  HeaderDropdownLayout,
  NavDropdownColumn,
} from "./header-dropdown-layout";
import {
  NavGroup,
  NavItemsList,
  SectionHeading,
} from "./nav-section-renderers";
import {
  buildJobItems,
  buildResourceItems,
  buildStartItems,
} from "./nav-section-content-config";

const HeaderListBuild = () => {
  const t = useTranslations();

  return (
    <HeaderDropdownLayout>
      <NavDropdownColumn width="primary">
        <SectionHeading title={t("nav.build.jobs.title")} />
        <NavItemsList items={buildJobItems} />
      </NavDropdownColumn>
      <NavDropdownColumn>
        <NavGroup title={t("nav.build.start.title")}>
          <NavItemsList items={buildStartItems} />
        </NavGroup>
      </NavDropdownColumn>
      <NavDropdownColumn>
        <NavGroup title={t("nav.build.resources.title")}>
          <NavItemsList items={buildResourceItems} />
        </NavGroup>
      </NavDropdownColumn>
    </HeaderDropdownLayout>
  );
};

export default HeaderListBuild;
