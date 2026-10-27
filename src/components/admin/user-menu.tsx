"use client";

import { ChevronDown, CircleUser, ExternalLink, LogOut } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/features/auth/actions";

type UserMenuProps = {
  email: string | null;
  roleLabels: string[];
  labels: {
    menu: string;
    signedInAs: string;
    yourRoles: string;
    noRoles: string;
    viewSite: string;
    opensInNewTab: string;
    signOut: string;
  };
};

export function UserMenu({ email, roleLabels, labels }: UserMenuProps) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="soft" size="sm" className="gap-2 px-2.5" aria-label={labels.menu}>
          <CircleUser aria-hidden className="size-5!" />
          <span className="hidden max-w-[12rem] truncate text-sm font-medium md:inline">{email}</span>
          <ChevronDown aria-hidden className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{labels.signedInAs}</DropdownMenuLabel>
        <p className="px-2.5 pb-2 text-sm font-semibold break-all">{email}</p>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{labels.yourRoles}</DropdownMenuLabel>
        <p className="px-2.5 pb-2 text-sm">
          {roleLabels.length > 0 ? roleLabels.join(", ") : labels.noRoles}
        </p>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <a href="/" target="_blank" rel="noopener">
              <ExternalLink aria-hidden />
              {labels.viewSite}
              <span className="sr-only"> ({labels.opensInNewTab})</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              startTransition(() => signOut());
            }}
          >
            <LogOut aria-hidden />
            {labels.signOut}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
