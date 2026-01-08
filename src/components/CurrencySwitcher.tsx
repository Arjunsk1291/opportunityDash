import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useCurrency } from '@/contexts/CurrencyContext';
import { DollarSign, Settings } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function CurrencySwitcher() {
  const { currency, setCurrency, exchangeRate, setExchangeRate } = useCurrency();
  const [tempRate, setTempRate] = useState(exchangeRate.toString());
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleRateUpdate = () => {
    const rate = parseFloat(tempRate);
    if (isNaN(rate) || rate <= 0) {
      toast.error('Please enter a valid exchange rate');
      return;
    }
    setExchangeRate(rate);
    toast.success(`Exchange rate updated to 1 USD = ${rate} AED`);
    setIsDialogOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <DollarSign className="h-4 w-4" />
            {currency}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Currency</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCurrency('USD')}>
            <span className={currency === 'USD' ? 'font-bold' : ''}>USD ($)</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCurrency('AED')}>
            <span className={currency === 'AED' ? 'font-bold' : ''}>AED (د.إ)</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs text-muted-foreground">
            Rate: 1 USD = {exchangeRate} AED
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exchange Rate Settings</DialogTitle>
            <DialogDescription>
              Set the USD to AED exchange rate. Default is 3.67 (UAE Dirham peg).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rate">Exchange Rate (1 USD = ? AED)</Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                value={tempRate}
                onChange={(e) => setTempRate(e.target.value)}
                placeholder="3.67"
              />
              <p className="text-xs text-muted-foreground">
                Current rate: 1 USD = {exchangeRate} AED
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleRateUpdate} className="flex-1">
                Update Rate
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setTempRate('3.67');
                  setExchangeRate(3.67);
                  toast.success('Reset to default rate (3.67)');
                }}
              >
                Reset to Default
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
