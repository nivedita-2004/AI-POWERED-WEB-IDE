"use server"
import { db } from "@/lib/db";
import { currentUser } from "@/modules/auth/actions"
import { error } from "console";
import { revalidatePath } from "next/cache";

export const toggleStarMarked = async(playgroundId: string , isChecked: boolean)=>{
    const user = await currentUser();
    const userId = user?.id;
    if(!userId){
        throw new Error("UserId is required");
    }
    try {
        const playground = await db.playground.findFirst({
            where: { id: playgroundId, userId },
            select: { id: true },
        });
        if (!playground) throw new Error("Playground not found");

        if(isChecked){
            await db.starMark.create({
                data: {
                    userId: userId,
                    playgroundId,
                    isMarked: isChecked,
                }
            })
        }
        else{
            await db.starMark.delete({
                where: {
                    userId_playgroundId:{
                        userId,
                        playgroundId: playgroundId,
                    }
                }
            })
        }
        revalidatePath("/dashboard");
        return {success: true, isMarked: isChecked};
    } catch (error) {
        console.error("Error updating problem:", error);
        return {success: false, error: "Failed to update problem"};
    }
}

export const getAllPlaygroundForUser = async()=>{
    const user = await currentUser();
    if (!user?.id) return [];

    try {
        const playground = await db.playground.findMany({
            where: {
                userId: user.id
            },
            include:{
                user:true,
                Starmark:{
                    where:{
                        userId: user.id
                    },
                    select:{
                        isMarked:true
                    }
                }
            }
        });
        return playground
    } catch (error) {
    console.log(error);
    return [];
}
}

export const createPlayground = async(data: {
    title: string;
    template: "REACT" | "NEXTJS" | "EXPRESS" | "VUE" | "HONO" | "ANGULAR";
    description?: string;
})=>{
    const user = await currentUser();
    if (!user?.id) throw new Error("Authentication is required");
    const {template,title, description} =data;

    try {
        const playground = await db.playground.create({
            data:{
                title: title,
                description: description,
                template: template,
                userId: user.id
            }
        })
        return playground;
    } catch (error) {
        
    }
}

export const deleteProjectById= async(id:string)=>{
    const user = await currentUser();
    if (!user?.id) throw new Error("Authentication is required");
    try {
        await db.playground.deleteMany({ where: { id, userId: user.id } });
        revalidatePath("/dashboard")
    } catch (error) {
        console.log(error)
    }
}

export const editProjectById = async(id: string, data:{title: string, description: string})=>{
    const user = await currentUser();
    if (!user?.id) throw new Error("Authentication is required");
    try {
        await db.playground.updateMany({ where: { id, userId: user.id }, data });
        revalidatePath("/dashboard")
    } catch (error) {
        console.log(error);
    }
}

export const duplicateProjectById = async (
  id: string
): Promise<void> => {
    const user = await currentUser();
    if (!user?.id) throw new Error("Authentication is required");
  try {
    const originalPlayground = await db.playground.findUnique({
            where: { id },
    });

        if (!originalPlayground || originalPlayground.userId !== user.id) {
      throw new Error("Original playground not found");
    }

        const duplicate = await db.playground.create({
      data: {
        title: `${originalPlayground.title} (Copy)`,
        description: originalPlayground.description,
        template: originalPlayground.template,
                userId: user.id,
      },
    });

        const templateFile = await db.templateFile.findUnique({
            where: { playgroundId: id },
        });
        if (templateFile) {
            await db.templateFile.create({
                data: {
                    playgroundId: duplicate.id,
                    content: JSON.parse(JSON.stringify(templateFile.content)),
                },
            });
        }

    revalidatePath("/dashboard");
  } catch (error) {
    console.error("Error duplicating project:", error);
    throw error;
  }
};