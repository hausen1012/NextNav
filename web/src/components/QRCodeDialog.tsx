import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, Copy, Check } from 'lucide-react'

interface QRCodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string
  title: string
}

export function QRCodeDialog({ open, onOpenChange, url, title }: QRCodeDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !canvasRef.current || !url) return
    QRCode.toCanvas(
      canvasRef.current,
      url,
      {
        width: 220,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      },
      (err) => {
        if (err) console.error('QR code generation error:', err)
      }
    )
  }, [open, url])

  const handleDownload = () => {
    if (!canvasRef.current) return
    const dataUrl = canvasRef.current.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${title || 'qrcode'}.png`
    a.click()
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore clipboard error
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xs text-center'>
        <DialogHeader>
          <DialogTitle className='text-base truncate'>{title || '链接二维码'}</DialogTitle>
        </DialogHeader>
        <div className='flex flex-col items-center justify-center p-2'>
          <div className='p-2 bg-white rounded-lg shadow-inner border inline-block'>
            <canvas ref={canvasRef} className='block' />
          </div>
          <p className='text-xs text-muted-foreground mt-3 max-w-full truncate px-2' title={url}>
            {url}
          </p>
        </div>
        <DialogFooter className='grid grid-cols-2 gap-2 sm:justify-stretch'>
          <Button variant='outline' size='sm' onClick={handleCopy} className='gap-1.5'>
            {copied ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
            {copied ? '已复制' : '复制链接'}
          </Button>
          <Button size='sm' onClick={handleDownload} className='gap-1.5'>
            <Download className='size-3.5' />
            下载 PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
