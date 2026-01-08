import { useState, useMemo } from "react";
import { Search, Filter, X, Calendar, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, subQuarters, subYears } from "date-fns";
import { cn } from "@/lib/utils";
import { Opportunity, STAGE_ORDER, GROUP_CLASSIFICATIONS } from "@/data/opportunityData";

type DatePreset = "all" | "thisMonth" | "lastMonth" | "thisQuarter" | "lastQuarter" | "thisYear" | "lastYear" | "custom";

type DateField = "dateTenderReceived" | "tenderPlannedSubmissionDate" | "tenderSubmittedDate" | "lastContactDate";

const DATE_FIELD_LABELS: Record<DateField, string> = {
  dateTenderReceived: "RFP Received",
  tenderPlannedSubmissionDate: "Planned Submission",
  tenderSubmittedDate: "Submitted Date",
  lastContactDate: "Last Activity",
};

const getDateRangeFromPreset = (preset: DatePreset): { from: Date | undefined; to: Date | undefined } => {
  const now = new Date();
  switch (preset) {
    case "thisMonth":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "lastMonth":
      const lastMonth = subMonths(now, 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    case "thisQuarter":
      return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case "lastQuarter":
      const lastQuarter = subQuarters(now, 1);
      return { from: startOfQuarter(lastQuarter), to: endOfQuarter(lastQuarter) };
    case "thisYear":
      return { from: startOfYear(now), to: endOfYear(now) };
    case "lastYear":
      const lastYear = subYears(now, 1);
      return { from: startOfYear(lastYear), to: endOfYear(lastYear) };
    case "all":
    default:
      return { from: undefined, to: undefined };
  }
};

const getPresetLabel = (preset: DatePreset): string => {
  switch (preset) {
    case "thisMonth": return "This Month";
    case "lastMonth": return "Last Month";
    case "thisQuarter": return "This Quarter";
    case "lastQuarter": return "Last Quarter";
    case "thisYear": return "This Year";
    case "lastYear": return "Last Year";
    case "custom": return "Custom Range";
    case "all":
    default: return "All Time";
  }
};

export interface FilterState {
  search: string;
  statuses: string[];
  groups: string[];
  leads: string[];
  clients: string[];
  clientTypes: string[];
  qualificationStatuses: string[];
  partnerInvolvement: string;
  dateRange: { from: Date | undefined; to: Date | undefined };
  datePreset: DatePreset;
  dateField: DateField;
  valueRange: { min: number | undefined; max: number | undefined };
  showAtRisk: boolean;
  showMissDeadline: boolean;
}

interface AdvancedFiltersProps {
  data: Opportunity[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClearFilters: () => void;
}

// Default: All Time (no date filter applied on initial load)
export const defaultFilters: FilterState = {
  search: "",
  statuses: [],
  groups: [],
  leads: [],
  clients: [],
  clientTypes: [],
  qualificationStatuses: [],
  partnerInvolvement: "all",
  dateRange: { from: undefined, to: undefined },
  datePreset: "all", // Initial bootup shows "All Time" - no date filtering
  dateField: "dateTenderReceived", // Default to RFP Received date
  valueRange: { min: undefined, max: undefined },
  showAtRisk: false,
  showMissDeadline: false,
};

export function AdvancedFilters({
  data,
  filters,
  onFiltersChange,
  onClearFilters,
}: AdvancedFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract unique values from data
  const uniqueValues = useMemo(() => {
    const leads = [...new Set(data.map((o) => o.internalLead).filter(Boolean))].sort();
    const clients = [...new Set(data.map((o) => o.clientName).filter(Boolean))].sort();
    const clientTypes = [...new Set(data.map((o) => o.clientType).filter(Boolean))].sort();
    const qualifications = [...new Set(data.map((o) => o.qualificationStatus).filter(Boolean))].sort();
    return { leads, clients, clientTypes, qualifications };
  }, [data]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.statuses.length > 0) count++;
    if (filters.groups.length > 0) count++;
    if (filters.leads.length > 0) count++;
    if (filters.clients.length > 0) count++;
    if (filters.clientTypes.length > 0) count++;
    if (filters.qualificationStatuses.length > 0) count++;
    if (filters.partnerInvolvement !== "all") count++;
    if (filters.dateRange.from || filters.dateRange.to) count++;
    if (filters.valueRange.min !== undefined || filters.valueRange.max !== undefined) count++;
    if (filters.showAtRisk) count++;
    if (filters.showMissDeadline) count++;
    return count;
  }, [filters]);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleArrayValue = (key: "statuses" | "groups" | "leads" | "clients" | "clientTypes" | "qualificationStatuses", value: string) => {
    const current = filters[key];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateFilter(key, updated);
  };

  return (
    <div className="space-y-4">
      {/* Search and Quick Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search opportunities, clients, tenders..."
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Status Quick Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              Status
              {filters.statuses.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5">
                  {filters.statuses.length}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="space-y-2">
              {STAGE_ORDER.map((status) => (
                <div key={status} className="flex items-center gap-2">
                  <Checkbox
                    id={`status-${status}`}
                    checked={filters.statuses.includes(status)}
                    onCheckedChange={() => toggleArrayValue("statuses", status)}
                  />
                  <Label htmlFor={`status-${status}`} className="text-sm cursor-pointer">
                    {status}
                  </Label>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="status-lost"
                  checked={filters.statuses.includes("Lost/Regretted")}
                  onCheckedChange={() => toggleArrayValue("statuses", "Lost/Regretted")}
                />
                <Label htmlFor="status-lost" className="text-sm cursor-pointer">
                  Lost/Regretted
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="status-hold"
                  checked={filters.statuses.includes("On Hold/Paused")}
                  onCheckedChange={() => toggleArrayValue("statuses", "On Hold/Paused")}
                />
                <Label htmlFor="status-hold" className="text-sm cursor-pointer">
                  On Hold/Paused
                </Label>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Group Quick Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              Group
              {filters.groups.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5">
                  {filters.groups.length}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-3" align="start">
            <div className="space-y-2">
              {GROUP_CLASSIFICATIONS.map((group) => (
                <div key={group} className="flex items-center gap-2">
                  <Checkbox
                    id={`group-${group}`}
                    checked={filters.groups.includes(group)}
                    onCheckedChange={() => toggleArrayValue("groups", group)}
                  />
                  <Label htmlFor={`group-${group}`} className="text-sm cursor-pointer">
                    {group}
                  </Label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Lead Quick Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              Lead
              {filters.leads.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5">
                  {filters.leads.length}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-3 max-h-[300px] overflow-auto" align="start">
            <div className="space-y-2">
              {uniqueValues.leads.map((lead) => (
                <div key={lead} className="flex items-center gap-2">
                  <Checkbox
                    id={`lead-${lead}`}
                    checked={filters.leads.includes(lead)}
                    onCheckedChange={() => toggleArrayValue("leads", lead)}
                  />
                  <Label htmlFor={`lead-${lead}`} className="text-sm cursor-pointer">
                    {lead}
                  </Label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Client Quick Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              Client
              {filters.clients.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5">
                  {filters.clients.length}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3 max-h-[300px] overflow-auto" align="start">
            <div className="space-y-2">
              {uniqueValues.clients.map((client) => (
                <div key={client} className="flex items-center gap-2">
                  <Checkbox
                    id={`client-${client}`}
                    checked={filters.clients.includes(client)}
                    onCheckedChange={() => toggleArrayValue("clients", client)}
                  />
                  <Label htmlFor={`client-${client}`} className="text-sm cursor-pointer truncate">
                    {client}
                  </Label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Date Field Selector */}
        <Select
          value={filters.dateField}
          onValueChange={(v) => updateFilter("dateField", v as DateField)}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(DATE_FIELD_LABELS) as DateField[]).map((field) => (
              <SelectItem key={field} value={field} className="text-xs">
                {DATE_FIELD_LABELS[field]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date Range */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Calendar className="h-3 w-3" />
              {filters.datePreset === "custom" && filters.dateRange.from ? (
                <span>
                  {format(filters.dateRange.from, "MMM d")}
                  {filters.dateRange.to && ` - ${format(filters.dateRange.to, "MMM d")}`}
                </span>
              ) : (
                getPresetLabel(filters.datePreset)
              )}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(["all", "thisMonth", "lastMonth", "thisQuarter", "lastQuarter", "thisYear", "lastYear"] as DatePreset[]).map((preset) => (
                  <Button
                    key={preset}
                    variant={filters.datePreset === preset ? "default" : "outline"}
                    size="sm"
                    className="text-xs justify-start"
                    onClick={() => {
                      const range = getDateRangeFromPreset(preset);
                      onFiltersChange({
                        ...filters,
                        datePreset: preset,
                        dateRange: range,
                      });
                    }}
                  >
                    {getPresetLabel(preset)}
                  </Button>
                ))}
                <Button
                  variant={filters.datePreset === "custom" ? "default" : "outline"}
                  size="sm"
                  className="text-xs justify-start"
                  onClick={() => {
                    onFiltersChange({
                      ...filters,
                      datePreset: "custom",
                    });
                  }}
                >
                  Custom Range
                </Button>
              </div>
              
              {filters.datePreset === "custom" && (
                <>
                  <Separator />
                  <CalendarComponent
                    mode="range"
                    selected={{
                      from: filters.dateRange.from,
                      to: filters.dateRange.to,
                    }}
                    onSelect={(range) =>
                      onFiltersChange({
                        ...filters,
                        datePreset: "custom",
                        dateRange: {
                          from: range?.from,
                          to: range?.to,
                        },
                      })
                    }
                    numberOfMonths={2}
                    className="pointer-events-auto"
                  />
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* More Filters Toggle */}
        <Button
          variant={isExpanded ? "secondary" : "outline"}
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="gap-2"
        >
          <Filter className="h-3 w-3" />
          More Filters
          {activeFilterCount > 0 && (
            <Badge variant="default" className="ml-1 px-1.5">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {/* Clear Filters */}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="gap-1">
            <X className="h-3 w-3" />
            Clear All
          </Button>
        )}
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4 bg-muted/30 rounded-lg border">
          {/* Client Type */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Client Type</Label>
            <Select
              value={filters.clientTypes[0] || "all"}
              onValueChange={(v) => updateFilter("clientTypes", v === "all" ? [] : [v])}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {uniqueValues.clientTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Qualification */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Qualification</Label>
            <Select
              value={filters.qualificationStatuses[0] || "all"}
              onValueChange={(v) => updateFilter("qualificationStatuses", v === "all" ? [] : [v])}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {uniqueValues.qualifications.map((q) => (
                  <SelectItem key={q} value={q}>
                    {q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Partner Involvement */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Partner</Label>
            <Select
              value={filters.partnerInvolvement}
              onValueChange={(v) => updateFilter("partnerInvolvement", v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="yes">With Partner</SelectItem>
                <SelectItem value="no">No Partner</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Value Range */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Min Value ($)</Label>
            <Input
              type="number"
              placeholder="0"
              className="h-8 text-xs"
              value={filters.valueRange.min ?? ""}
              onChange={(e) =>
                updateFilter("valueRange", {
                  ...filters.valueRange,
                  min: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Max Value ($)</Label>
            <Input
              type="number"
              placeholder="∞"
              className="h-8 text-xs"
              value={filters.valueRange.max ?? ""}
              onChange={(e) =>
                updateFilter("valueRange", {
                  ...filters.valueRange,
                  max: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </div>

          {/* Special Flags */}
          <div className="space-y-3">
            <Label className="text-xs font-medium">Flags</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="at-risk"
                  checked={filters.showAtRisk}
                  onCheckedChange={(checked) => updateFilter("showAtRisk", !!checked)}
                />
                <Label htmlFor="at-risk" className="text-xs cursor-pointer">
                  At Risk Only
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="miss-deadline"
                  checked={filters.showMissDeadline}
                  onCheckedChange={(checked) => updateFilter("showMissDeadline", !!checked)}
                />
                <Label htmlFor="miss-deadline" className="text-xs cursor-pointer">
                  Missing Deadline
                </Label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Tags */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.search && (
            <Badge variant="secondary" className="gap-1 pl-2">
              Search: "{filters.search}"
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => updateFilter("search", "")}
              />
            </Badge>
          )}
          {filters.statuses.map((status) => (
            <Badge key={status} variant="secondary" className="gap-1 pl-2">
              {status}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayValue("statuses", status)}
              />
            </Badge>
          ))}
          {filters.groups.map((group) => (
            <Badge key={group} variant="secondary" className="gap-1 pl-2">
              {group}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayValue("groups", group)}
              />
            </Badge>
          ))}
          {filters.leads.map((lead) => (
            <Badge key={lead} variant="secondary" className="gap-1 pl-2">
              Lead: {lead}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayValue("leads", lead)}
              />
            </Badge>
          ))}
          {filters.clients.map((client) => (
            <Badge key={client} variant="secondary" className="gap-1 pl-2">
              Client: {client}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayValue("clients", client)}
              />
            </Badge>
          ))}
          {filters.showAtRisk && (
            <Badge variant="destructive" className="gap-1 pl-2">
              At Risk
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => updateFilter("showAtRisk", false)}
              />
            </Badge>
          )}
          {filters.showMissDeadline && (
            <Badge variant="destructive" className="gap-1 pl-2">
              Missing Deadline
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => updateFilter("showMissDeadline", false)}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to apply filters
export function applyFilters(data: Opportunity[], filters: FilterState): Opportunity[] {
  return data.filter((o) => {
    // Search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch =
        o.tenderName.toLowerCase().includes(searchLower) ||
        o.clientName.toLowerCase().includes(searchLower) ||
        o.opportunityRefNo.toLowerCase().includes(searchLower) ||
        o.internalLead.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Status
    if (filters.statuses.length > 0 && !filters.statuses.includes(o.canonicalStage)) {
      return false;
    }

    // Groups
    if (filters.groups.length > 0 && !filters.groups.includes(o.groupClassification)) {
      return false;
    }

    // Leads
    if (filters.leads.length > 0 && !filters.leads.includes(o.internalLead)) {
      return false;
    }

    // Clients
    if (filters.clients.length > 0 && !filters.clients.includes(o.clientName)) {
      return false;
    }

    // Client Types
    if (filters.clientTypes.length > 0 && !filters.clientTypes.includes(o.clientType)) {
      return false;
    }

    // Qualification
    if (
      filters.qualificationStatuses.length > 0 &&
      !filters.qualificationStatuses.includes(o.qualificationStatus)
    ) {
      return false;
    }

    // Partner
    if (filters.partnerInvolvement === "yes" && !o.partnerInvolvement) return false;
    if (filters.partnerInvolvement === "no" && o.partnerInvolvement) return false;

    // Date Range - filter by selected date field
    const dateFieldValue = o[filters.dateField];
    if (filters.dateRange.from || filters.dateRange.to) {
      if (!dateFieldValue) return false; // Exclude if no date and range is specified
      const dateValue = new Date(dateFieldValue);
      if (filters.dateRange.from && dateValue < filters.dateRange.from) return false;
      if (filters.dateRange.to && dateValue > filters.dateRange.to) return false;
    }

    // Value Range
    if (filters.valueRange.min !== undefined && o.opportunityValue < filters.valueRange.min) {
      return false;
    }
    if (filters.valueRange.max !== undefined && o.opportunityValue > filters.valueRange.max) {
      return false;
    }

    // Flags
    if (filters.showAtRisk && !o.isAtRisk) return false;
    if (filters.showMissDeadline && !o.willMissDeadline) return false;

    return true;
  });
}
