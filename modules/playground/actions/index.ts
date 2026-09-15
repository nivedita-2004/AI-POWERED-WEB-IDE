"use server";

import { db } from "@/lib/db";
import { TemplateFolder } from "../lib/path-to-json";
import { currentUser } from "@/modules/auth/actions";





export const getPlaygroundById = async(id:string)=>{
    const user = await currentUser();
    if (!user?.id) return null;
    try {
        const playground = await db.playground.findFirst({
            where:{id, userId: user.id},
            select:{
                title:true,
                TemplateFiles:{
                    select:{
                        content:true
                    }
                }
            }
        })
        return playground;
    } catch (error) {
        console.log(error)
    }
}

export const SaveUpdatedCode = async(playgroundId:string , data:TemplateFolder)=>{
    const user = await currentUser();
  if (!user) return null;

  try {
        const playground = await db.playground.findFirst({
            where: { id: playgroundId, userId: user.id },
            select: { id: true },
        });
        if (!playground) return null;

    const updatedPlayground = await db.templateFile.upsert({
        where:{
            playgroundId
        },
        update:{
            content:JSON.stringify(data)
        },
        create:{
            playgroundId,
            content:JSON.stringify(data)
        }
    })

    return updatedPlayground;
  } catch (error) {
     console.log("SaveUpdatedCode error:", error);
    return null;
  }
}