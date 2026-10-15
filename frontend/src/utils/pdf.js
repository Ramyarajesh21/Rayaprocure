import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// Turns the on-screen A4 sheet into a multi-page PDF (same look as the preview).
export async function elementToPdf(element) {
    const target = element.querySelector(".doc-page") || element;

    const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        onclone: (clonedDocument) => {
            // The on-screen sheet may be scaled down to fit; export it at full size.
            clonedDocument.querySelectorAll("[data-doc-fit]").forEach((box) => {
                box.style.height = "auto";
                box.style.width = "auto";
            });
            clonedDocument.querySelectorAll(".doc-fit-inner").forEach((inner) => {
                inner.style.transform = "none";
                inner.style.width = "auto";
            });
        },
    });

    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pxPerMm = canvas.width / pageWidth;
    const pageHeightPx = Math.floor(pageHeight * pxPerMm);

    let offsetY = 0;
    let page = 0;
    while (offsetY < canvas.height) {
        const sliceHeight = Math.min(pageHeightPx, canvas.height - offsetY);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;

        const context = pageCanvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        context.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

        if (page > 0) pdf.addPage();
        pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWidth, sliceHeight / pxPerMm);

        offsetY += sliceHeight;
        page += 1;
    }
    return pdf;
}

export async function downloadElementPdf(element, filename) {
    const pdf = await elementToPdf(element);
    pdf.save(filename);
}

export async function elementToPdfBlob(element) {
    const pdf = await elementToPdf(element);
    return pdf.output("blob");
}
